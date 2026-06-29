import os
import asyncio
import socket
import time
import hmac
import hashlib
import logging
import subprocess
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from scheduler import schedule_and_dispatch_crawls
from dotenv import load_dotenv

load_dotenv()

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("digipromix")

VERSION    = "2.2.6"
START_TIME = time.time()

DEPLOY_SECRET = os.environ.get("DEPLOY_SECRET", "")

# Service-role-based admin trigger: lets the Supabase service role key call
# /admin/deploy without needing a GitHub HMAC signature. Useful when SSH
# isn't available and the GitHub webhook isn't firing.
# Required env: SUPABASE_SERVICE_ROLE_KEY (already used elsewhere).
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Self-scheduling — runs every N hours independent of any external cron.
# Set INTERNAL_SCHEDULER_HOURS=0 to disable (e.g. if you ONLY want pg_cron
# to drive crawls). Default 6h matches the Supabase schedule-crawls cutoff.
INTERNAL_SCHEDULER_HOURS = int(os.environ.get("INTERNAL_SCHEDULER_HOURS", "6"))

# In-memory log buffer (last 500 lines). Filters vulnerability-scanner
# spam (404 hits on /wp-admin, /.env, *.php etc) so the useful crawler
# logs aren't flushed by drive-by bot traffic.
_log_buffer: list[str] = []

_SCANNER_NOISE_KEYWORDS = (
    "-> 404",                # any 404 — vulnerability scanners spam these
    "PROPFIND",
    ".php ",
    "/wp-admin",
    "/wp-content",
    "/wp-includes",
    "/.env",
    "/.git",
    "/cgi-bin",
    "/actuator",
)

class _BufferHandler(logging.Handler):
    def emit(self, record):
        msg = self.format(record)
        # Drop scanner noise so real crawler events stay visible in the buffer
        if any(k in msg for k in _SCANNER_NOISE_KEYWORDS):
            return
        _log_buffer.append(msg)
        if len(_log_buffer) > 500:
            _log_buffer.pop(0)

_buf_handler = _BufferHandler()
_buf_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logging.getLogger().addHandler(_buf_handler)


# ── Lifespan ───────────────────────────────────────────────────────────────

async def _internal_scheduler_loop():
    """
    Self-driving scheduler — runs schedule_and_dispatch_crawls() every
    INTERNAL_SCHEDULER_HOURS hours forever. Removes the dependency on an
    external cron (the Supabase pg_cron 'trigger-crawl-6h' was disabled
    when we moved primary crawling to the Edge-fn path; this is a backup
    that ensures Playwright still runs periodically).

    Set INTERNAL_SCHEDULER_HOURS=0 to disable.
    """
    if INTERNAL_SCHEDULER_HOURS <= 0:
        logger.info("[Scheduler] Internal scheduler DISABLED (INTERNAL_SCHEDULER_HOURS=0)")
        return
    interval_s = INTERNAL_SCHEDULER_HOURS * 3600
    logger.info(f"[Scheduler] Internal loop active — fires every {INTERNAL_SCHEDULER_HOURS}h")
    # Stagger the first sleep so a freshly-deployed instance doesn't double-run
    # with the startup crawl
    await asyncio.sleep(interval_s)
    while True:
        try:
            logger.info("[Scheduler] Internal tick — dispatching crawl cycle")
            await schedule_and_dispatch_crawls()
        except Exception as e:
            logger.error(f"[Scheduler] Internal tick failed (non-fatal): {e}")
        await asyncio.sleep(interval_s)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"[Digipromix] v{VERSION} starting on {socket.gethostname()}")
    try:
        proc = await asyncio.create_subprocess_exec(
            "python3.11", "-m", "playwright", "install", "chromium",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        logger.info("[Digipromix] Playwright browsers ready")
    except Exception as e:
        logger.warning(f"[Digipromix] Playwright install check failed: {e}")

    logger.info("[Digipromix] Running startup crawl cycle...")
    asyncio.create_task(schedule_and_dispatch_crawls())

    # NEW: keep the crawler self-scheduling so it doesn't sit idle if the
    # external cron is disabled or fails.
    asyncio.create_task(_internal_scheduler_loop())

    yield
    # Clean up shared httpx connection pools
    logger.info("[Digipromix] Shutting down — closing connection pools...")
    try:
        from db import close_db_client
        from crawler import close_http_client
        await close_db_client()
        await close_http_client()
    except Exception as e:
        logger.warning(f"[Digipromix] Cleanup warning: {e}")
    logger.info("[Digipromix] Shutdown complete.")


# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(title="Digipromix Crawler", version=VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    ms = (time.time() - t0) * 1000
    logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({ms:.0f}ms)")
    return response


# ── Models ─────────────────────────────────────────────────────────────────
class TriggerRequest(BaseModel):
    competitor_id: str | None = None


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    import psutil
    uptime_s = int(time.time() - START_TIME)
    sched = (
        f"every_{INTERNAL_SCHEDULER_HOURS}_hours"
        if INTERNAL_SCHEDULER_HOURS > 0 else "external_only"
    )
    return {
        "status":   "ok",
        "version":  VERSION,
        "uptime":   f"{uptime_s // 3600}h {(uptime_s % 3600) // 60}m {uptime_s % 60}s",
        "host":     socket.gethostname(),
        "cpu_pct":  psutil.cpu_percent(interval=0.1),
        "mem_pct":  psutil.virtual_memory().percent,
        "schedule": sched,
        "api_url":  "https://44.222.116.245.nip.io",
    }


@app.get("/api/status")
async def status():
    """Return live counts of crawl jobs and monitored pages."""
    try:
        from db import db_select
        running  = await db_select("crawl_jobs", select="id", filters={"status": "eq.running"})
        queued   = await db_select("crawl_jobs", select="id", filters={"status": "eq.queued"})
        failed   = await db_select("crawl_jobs", select="id", filters={"status": "eq.failed"})
        pages    = await db_select("monitored_pages", select="id", filters={"is_active": "eq.true"})
        return {
            "running_jobs":    len(running),
            "queued_jobs":     len(queued),
            "failed_jobs":     len(failed),
            "monitored_pages": len(pages),
            "uptime":          f"{int(time.time() - START_TIME)}s",
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/logs")
def get_logs(n: int = 50):
    """Return last N log lines for quick debugging."""
    return {"logs": _log_buffer[-n:]}


@app.post("/api/trigger")
async def trigger(req: TriggerRequest = TriggerRequest()):
    """
    Manually trigger a crawl cycle.
    - No body -> crawl ALL due pages
    - { "competitor_id": "uuid" } -> crawl only that competitor immediately
    """
    label = req.competitor_id or "ALL"
    logger.info(f"[Trigger] /api/trigger received — dispatching for: {label}")
    asyncio.create_task(schedule_and_dispatch_crawls(req.competitor_id))
    if req.competitor_id:
        return {"status": "crawl triggered", "competitor_id": req.competitor_id}
    return {"status": "full crawl cycle triggered"}


@app.post("/deploy")
async def deploy_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None),
):
    """
    GitHub webhook endpoint for auto-deploy on push to main.
    Set secret in GitHub webhook settings and DEPLOY_SECRET env var.
    """
    body = await request.body()

    # Verify GitHub signature if DEPLOY_SECRET is set
    if DEPLOY_SECRET:
        if not x_hub_signature_256:
            raise HTTPException(status_code=401, detail="Missing signature")
        expected = "sha256=" + hmac.new(
            DEPLOY_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, x_hub_signature_256):
            raise HTTPException(status_code=401, detail="Invalid signature")

    # Only deploy on push to main branch
    payload = await request.json() if not body else __import__("json").loads(body)
    ref = payload.get("ref", "")
    if ref and ref != "refs/heads/main":
        return {"status": "skipped", "reason": f"push to {ref}, not main"}

    logger.info("[Deploy] GitHub webhook received — deploying...")
    asyncio.create_task(_run_deploy())
    return {"status": "deploy started"}


async def _run_deploy():
    """Pull latest code from GitHub and restart service."""
    try:
        result = subprocess.run(
            ["/home/ec2-user/deploy.sh"],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0:
            logger.info(f"[Deploy] Success:\n{result.stdout}")
        else:
            logger.error(f"[Deploy] Failed:\n{result.stderr}")
    except Exception as e:
        logger.error(f"[Deploy] Exception: {e}")


@app.post("/admin/deploy")
async def admin_deploy(
    authorization: str | None = Header(default=None),
):
    """
    Service-role-authenticated manual deploy.
    Pass: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
    Bypasses GitHub HMAC — useful when SSH isn't available.
    """
    if not SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_SERVICE_ROLE_KEY not configured")
    expected = f"Bearer {SERVICE_ROLE_KEY}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    logger.info("[Admin] /admin/deploy invoked — pulling latest + restarting")
    asyncio.create_task(_run_deploy())
    return {"status": "deploy started"}


@app.post("/admin/restart")
async def admin_restart(
    authorization: str | None = Header(default=None),
):
    """
    Service-role-authenticated restart (no git pull). Useful when the worker
    is alive but stuck — quick recovery without redeploying code.
    """
    if not SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_SERVICE_ROLE_KEY not configured")
    expected = f"Bearer {SERVICE_ROLE_KEY}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    logger.info("[Admin] /admin/restart invoked — restarting service")
    async def _restart():
        try:
            subprocess.run(
                ["sudo", "systemctl", "restart", "digipromix-crawler"],
                capture_output=True, text=True, timeout=30,
            )
        except Exception as e:
            logger.error(f"[Admin] Restart failed: {e}")
    asyncio.create_task(_restart())
    return {"status": "restart triggered"}
