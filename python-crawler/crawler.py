"""
crawler.py — Production Playwright-based competitor page crawler.
EC2 deployment — uses db.py (httpx) for all Supabase operations.

Optimizations (vs previous version):
  1. Browser pool — single Chromium instance reused across all pages in a cycle
     (~70% faster: skips ~3s browser launch per page).
  2. Shared httpx.AsyncClient — connection pooling for detect-changes calls.
  3. HEAD prefetch — skip dead URLs (404/5xx) before launching Playwright.
  4. Gzip-compressed snapshots — ~80% storage cost reduction.
  5. Retry with exponential backoff for transient Playwright errors.
  6. Gemini model fallback (gemini-2.5-flash → flash-latest → 2.5-flash-lite).
"""

import os
import gzip
import json
import asyncio
import logging
import random
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser
from playwright.async_api import async_playwright, Browser, BrowserContext, Playwright
import extractor
import google.generativeai as genai
from db import db_select, db_update, db_insert, storage_upload, storage_download
import httpx

# playwright-stealth: patches Chromium fingerprints (navigator.webdriver, plugins,
# WebGL, canvas hash, audio context, etc.) to defeat first-tier bot detection.
# Soft-import so the crawler still boots even if the package isn't installed.
try:
    from playwright_stealth import stealth_async   # type: ignore
    _STEALTH_AVAILABLE = True
except ImportError:
    _STEALTH_AVAILABLE = False
    stealth_async = None   # type: ignore

logger = logging.getLogger("digipromix")

SUPABASE_URL              = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
GEMINI_API_KEY            = os.environ.get("GEMINI_API_KEY", "")
API_BASE_URL              = os.environ.get("API_BASE_URL", "https://44.222.116.245.nip.io")

# Scrape.do — paid scraping API with proxy rotation + JS render. Used as a
# fallback when direct Playwright crawl hits 403 / timeout. Cost-efficient
# because the 5 well-behaved sites continue to use the free direct path.
SCRAPE_DO_API_KEY         = os.environ.get("SCRAPE_DO_API_KEY", "")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

MAX_HTML_BYTES = 10 * 1024 * 1024

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
]

# Identifier used for robots.txt parsing + sent as the User-Agent on the
# initial HEAD prefetch + robots.txt fetch. Anyone reading their server logs
# can see who we are + how to reach us if they want us to stop.
DIGIPROMIX_UA_TOKEN = "DigiPromix-Bot"
DIGIPROMIX_UA_FULL  = "DigiPromix-Bot/2.2.6 (+https://www.digipromix.com/bot)"

# ── robots.txt compliance ───────────────────────────────────────────────────
#
# Per the MVP 2.0 delivery plan §10 + our legal-guardrails review, we honor
# robots.txt voluntarily. Most enterprise sites publish a robots.txt that
# specifies which paths are off-limits for automated agents. Respecting it
# is best practice + reduces legal exposure.
#
# Implementation: per-origin cache (TTL 24h), fetched lazily on first crawl.

_ROBOTS_CACHE: dict[str, tuple[RobotFileParser, float]] = {}
_ROBOTS_TTL_S = 24 * 3600

async def _get_robots_for(origin: str) -> RobotFileParser | None:
    """Return a RobotFileParser for the origin, cached for 24h. None on fetch failure."""
    cached = _ROBOTS_CACHE.get(origin)
    now = time.time()
    if cached and (now - cached[1]) < _ROBOTS_TTL_S:
        return cached[0]
    rp = RobotFileParser()
    rp.set_url(f"{origin}/robots.txt")
    try:
        client = get_http_client()
        resp = await client.get(
            f"{origin}/robots.txt",
            headers={"User-Agent": DIGIPROMIX_UA_FULL},
            timeout=8.0,
        )
        if resp.status_code == 200 and resp.text:
            rp.parse(resp.text.splitlines())
        else:
            # No robots.txt or returned an error — treat as fully allowed
            rp.parse([])
    except Exception:
        rp.parse([])  # Fail open — site error shouldn't block us
    _ROBOTS_CACHE[origin] = (rp, now)
    return rp

async def _is_crawl_allowed(url: str) -> bool:
    """Check robots.txt before crawling. Returns True if allowed or no robots.txt."""
    try:
        p = urlparse(url)
        origin = f"{p.scheme}://{p.netloc}"
        rp = await _get_robots_for(origin)
        if rp is None:
            return True
        # Check against both our token and the generic User-Agent string.
        # site can ban "DigiPromix-Bot" explicitly OR "*" (everyone).
        return rp.can_fetch(DIGIPROMIX_UA_TOKEN, url) and rp.can_fetch("*", url)
    except Exception:
        return True   # Fail open

VALID_CHANGE_TYPES = {"promotion", "price_change", "new_landing_page",
                      "new_blog_post", "banner_change", "content_change",
                      "campaign_launch"}   # coordinated multi-signal campaign launch
VALID_SEVERITIES   = {"low", "medium", "high"}


# ── Browser pool ───────────────────────────────────────────────────────────

class BrowserPool:
    """Holds one shared Playwright + Chromium instance for a crawl cycle.
    Each page gets its own BrowserContext (isolated cookies/UA) but they all
    share the same browser process — saves ~3s per page on browser startup."""

    def __init__(self):
        self.pw: Playwright | None = None
        self.browser: Browser | None = None

    async def start(self):
        self.pw = await async_playwright().start()
        # NOTE: removed `--single-process` flag — it was the root cause of
        # "Target page, context or browser has been closed" crashes under
        # concurrent contexts on t3.small. Chromium runs multi-process now
        # (one renderer per tab) which is the supported / stable config.
        self.browser = await self.pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
                "--memory-pressure-off",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-site-isolation-trials",
                "--ignore-certificate-errors",
            ],
        )
        logger.info("[BrowserPool] Chromium started")

    async def stop(self):
        if self.browser:
            try: await self.browser.close()
            except Exception: pass
            self.browser = None
        if self.pw:
            try: await self.pw.stop()
            except Exception: pass
            self.pw = None
        logger.info("[BrowserPool] Chromium stopped")

    @asynccontextmanager
    async def context(self):
        """Yield a fresh BrowserContext (isolated session) on the shared browser."""
        if not self.browser:
            raise RuntimeError("BrowserPool not started")
        ua = random.choice(USER_AGENTS)
        ctx: BrowserContext = await self.browser.new_context(
            user_agent=ua,
            viewport={"width": 1440, "height": 900},
            locale="en-US",
            timezone_id="America/New_York",
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        await ctx.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
            Object.defineProperty(navigator, 'languages', {get: () => ['en-US','en']});
            window.chrome = {runtime: {}};
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({query: () => Promise.resolve({state: 'granted'})})
            });
        """)
        await ctx.route(
            "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,mp4,webm,ico}",
            lambda route: route.abort()
        )
        try:
            yield ctx
        finally:
            try: await ctx.close()
            except Exception: pass


# ── Shared HTTP client (connection pooling) ────────────────────────────────

_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Lazy singleton — connection-pooled httpx client reused across calls."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            follow_redirects=True,
        )
    return _http_client


async def close_http_client():
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


# ── Scrape.do fallback (paid proxy + JS render) ────────────────────────────

async def _render_via_scrape_do(url: str) -> tuple[str, int]:
    """
    Fetch a page through scrape.do — handles WAF / anti-bot blocks for the
    sites Playwright can't reach directly (Saturn, Media Markt, Zalando, ASOS).
    Auto-detects country from the URL TLD for proper geo-routing.

    Raises on failure so the caller can mark the job failed.
    """
    if not SCRAPE_DO_API_KEY:
        raise RuntimeError("SCRAPE_DO_API_KEY not configured")

    # Pick geo based on TLD — German consumer sites need a DE IP to render
    # without a country redirect / blocker page
    geo = "us"
    if ".de" in url or "/de/" in url or "zalando.de" in url:
        geo = "de"
    elif ".uk" in url or ".co.uk" in url:
        geo = "gb"
    elif ".fr" in url:
        geo = "fr"

    base_params = {
        "token":   SCRAPE_DO_API_KEY,
        "url":     url,
        "render":  "true",          # execute JS
        "geoCode": geo,             # country routing
    }

    client = get_http_client()

    # Two-tier attempt: residential proxy first (better success on hard WAFs),
    # then datacenter proxy if residential pool exhausts (RotationFailed).
    # Some sites (e.g. Saturn) block residential subnets but accept clean DC IPs.
    for attempt in ({**base_params, "super": "true"}, base_params):
        try:
            resp = await client.get("https://api.scrape.do/", params=attempt, timeout=90.0)
        except Exception as e:
            last_err = f"network: {e}"
            continue

        target_status = int(resp.headers.get("Scrape.do-Target-Status", resp.status_code))

        # API-level failure with rotation issue → try the next tier
        if resp.status_code in (502, 503) and "RotationFailed" in (resp.text or ""):
            last_err = f"rotation failed on tier {'super' if attempt.get('super') else 'standard'}"
            continue
        if resp.status_code != 200:
            raise RuntimeError(f"scrape.do API HTTP {resp.status_code}: {resp.text[:200]}")
        if target_status >= 400:
            last_err = f"target HTTP {target_status}"
            continue
        return resp.text, target_status

    raise RuntimeError(f"scrape.do exhausted all tiers: {last_err}")


# ── HEAD prefetch ───────────────────────────────────────────────────────────

async def _head_check(url: str) -> tuple[bool, int]:
    """Quick HEAD request to skip dead URLs before launching Playwright.
    Returns (should_proceed, http_status). On HEAD-blocked sites, defaults to True."""
    try:
        client = get_http_client()
        resp = await client.head(
            url,
            headers={"User-Agent": random.choice(USER_AGENTS)},
            timeout=8.0,
        )
        status = resp.status_code
        # Many sites block HEAD with 405; that's fine — proceed to GET via Playwright
        if status == 405 or status == 403:
            return True, status
        # Hard 4xx (except 405/403) or 5xx → skip
        if status >= 400:
            return False, status
        return True, status
    except (httpx.TimeoutException, httpx.NetworkError):
        # Network blip — give Playwright a chance anyway
        return True, 0
    except Exception:
        return True, 0


# ── Playwright renderer (uses BrowserPool) ─────────────────────────────────

async def _render_page(pool: BrowserPool, url: str) -> tuple[str, int]:
    """Render a page using the shared BrowserPool. Each call gets a fresh context."""
    async with pool.context() as ctx:
        page = await ctx.new_page()
        # v2.2.3: apply playwright-stealth to patch browser fingerprints before
        # navigating. Defeats most basic Cloudflare / DataDome / PerimeterX
        # surface checks. Best-effort — won't bypass enterprise CAPTCHAs.
        if _STEALTH_AVAILABLE:
            try:
                await stealth_async(page)
            except Exception as e:
                logger.warning(f"[Stealth] apply failed (non-fatal): {e}")
        http_status = 200
        try:
            response = await page.goto(url, wait_until="commit", timeout=20_000)
            if response:
                http_status = response.status
            try:
                await page.wait_for_load_state("networkidle", timeout=12_000)
            except Exception:
                pass
            await page.evaluate("""
                () => new Promise(resolve => {
                    let total = 0;
                    const maxScroll = Math.min(document.body.scrollHeight, 15000);
                    const step = 400, delay = 60;
                    const timer = setInterval(() => {
                        window.scrollBy(0, step);
                        total += step;
                        if (total >= maxScroll) {
                            clearInterval(timer);
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, delay);
                    setTimeout(() => { clearInterval(timer); window.scrollTo(0, 0); resolve(); }, 8000);
                })
            """)
            await page.wait_for_timeout(1_200)
            html = await page.content()
        finally:
            try: await page.close()
            except Exception: pass

    if len(html.encode("utf-8")) > MAX_HTML_BYTES:
        logger.warning(f"[Crawler] Page too large ({len(html)//1024}KB), truncating")
        html = html[:MAX_HTML_BYTES]
    return html, http_status


# ── Gemini AI ──────────────────────────────────────────────────────────────

# Free-tier Gemini models in priority order. Auto-falls back on 404 or 429.
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
]


def _call_gemini_with_fallback(prompt: str) -> str:
    """Call Gemini with model fallback on transient errors. Sync — runs inside a thread."""
    last_err = "no models attempted"
    for model_name in GEMINI_MODELS:
        try:
            model = genai.GenerativeModel(model_name)
            return model.generate_content(prompt).text.strip()
        except Exception as e:
            msg = str(e)
            last_err = msg
            if "429" in msg or "404" in msg or "not found" in msg.lower() or "quota" in msg.lower():
                logger.warning(f"[AI] Model {model_name} unavailable ({msg[:80]}), trying next...")
                continue
            raise
    raise RuntimeError(f"All Gemini models failed. Last error: {last_err}")


async def _ai_summarise(url, old_text, new_text, old_headings, new_headings,
                        old_prices, new_prices, new_html: str = "",
                        new_norm_text: str = "") -> dict | None:
    if not GEMINI_API_KEY:
        return None

    # Extract additional campaign signals for richer AI context
    new_ctas        = extractor.extract_cta_buttons(new_html)[:8] if new_html else []
    promo_keywords  = extractor.detect_promotion_keywords(new_norm_text or new_text)[:10]
    has_countdown   = extractor.has_countdown_timer(new_html) if new_html else False
    has_strikethrough = extractor.has_strikethrough_prices(new_html) if new_html else False

    prompt = f"""
You are a senior competitive intelligence analyst.
Compare the OLD and NEW versions of a competitor webpage and produce a JSON report.

PAGE URL: {url}
OLD HEADINGS: {json.dumps([h["text"] for h in old_headings[:10]])}
NEW HEADINGS: {json.dumps([h["text"] for h in new_headings[:10]])}
OLD PRICES: {json.dumps(old_prices[:10])}
NEW PRICES: {json.dumps(new_prices[:10])}
NEW CTA BUTTONS: {json.dumps(new_ctas)}
NEW PROMO KEYWORDS DETECTED: {json.dumps(promo_keywords)}
HAS COUNTDOWN TIMER: {has_countdown}
HAS STRIKETHROUGH PRICES: {has_strikethrough}

OLD PAGE TEXT (first 3000 chars):
{old_text[:3000]}

NEW PAGE TEXT (first 3000 chars):
{new_text[:3000]}

CHANGE TYPE DEFINITIONS:
- campaign_launch: Coordinated multi-signal launch — ads + landing page + active promo simultaneously (use when campaign_score >= 70 or countdown + tracking pixel + promo code all present)
- promotion: Single promotional offer, discount, or limited-time deal
- price_change: Prices were added, removed, or modified
- new_landing_page: New dedicated landing page or entry point created
- new_blog_post: New blog or news article published
- banner_change: Hero section or announcement banner updated
- content_change: General text or feature copy updated

Respond ONLY with a valid JSON object — no markdown, no explanation:
{{
  "title": "Short 5-8 word punchy title of the most important change",
  "description": "2-3 sentences explaining the business impact and what changed.",
  "change_type": "campaign_launch|promotion|price_change|new_landing_page|new_blog_post|banner_change|content_change",
  "severity": "low|medium|high",
  "added_content": ["up to 5 key new content strings"],
  "removed_content": ["up to 5 key removed content strings"],
  "price_change_detail": "human-readable price change sentence or empty string",
  "action_recommended": "1 sentence on what the user should do in response",
  "campaign_score": <integer 0-100: overall campaign intensity; 70+ suggests campaign_launch>,
  "urgency_signals": ["up to 3 specific urgency indicators found, e.g. countdown timer, limited stock text"]
}}
"""
    try:
        raw   = await asyncio.wait_for(
            asyncio.to_thread(_call_gemini_with_fallback, prompt),
            timeout=30,
        )
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.split("```")[0]
        result = json.loads(raw.strip())
        if result.get("change_type") not in VALID_CHANGE_TYPES:
            result["change_type"] = "content_change"
        if result.get("severity") not in VALID_SEVERITIES:
            result["severity"] = "low"
        for f in ("added_content", "removed_content", "urgency_signals"):
            if not isinstance(result.get(f), list):
                result[f] = []
            else:
                result[f] = [s for s in result[f] if isinstance(s, str)][:5]
        if not isinstance(result.get("price_change_detail"), str):
            result["price_change_detail"] = ""
        if not isinstance(result.get("action_recommended"), str):
            result["action_recommended"] = ""
        # Validate campaign_score (0–100 int)
        cs = result.get("campaign_score")
        if not isinstance(cs, int) or not (0 <= cs <= 100):
            result["campaign_score"] = 0
        return result
    except asyncio.TimeoutError:
        logger.warning(f"[AI] Gemini timed out for {url}")
        return None
    except Exception as e:
        logger.warning(f"[AI] Gemini failed: {e}")
        return None


# ── DB helpers ─────────────────────────────────────────────────────────────

async def _fail_job(job_id: str | None, msg: str):
    if not job_id:
        return
    try:
        await db_update("crawl_jobs", {
            "status": "failed",
            "error_message": msg[:250],
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }, {"id": f"eq.{job_id}"})
    except Exception:
        pass

async def _complete_job(job_id: str | None):
    if not job_id:
        return
    try:
        await db_update("crawl_jobs", {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }, {"id": f"eq.{job_id}"})
    except Exception:
        pass

async def _touch_page(monitored_page_id: str):
    try:
        await db_update("monitored_pages",
                        {"last_crawled_at": datetime.now(timezone.utc).isoformat()},
                        {"id": f"eq.{monitored_page_id}"})
    except Exception:
        pass


# ── Snapshot storage helpers (gzip compression) ────────────────────────────

async def _upload_snapshot(storage_path_gz: str, html: str) -> None:
    """Upload gzip-compressed HTML snapshot. ~80% smaller than raw HTML."""
    raw_bytes  = html.encode("utf-8")
    compressed = gzip.compress(raw_bytes, compresslevel=6)
    ratio      = (1 - len(compressed) / max(len(raw_bytes), 1)) * 100
    logger.info(f"[Storage] Compressed {len(raw_bytes)//1024}KB → {len(compressed)//1024}KB ({ratio:.0f}% saved)")
    await storage_upload(
        "snapshots", storage_path_gz, compressed,
        content_type="application/gzip", upsert=True,
    )


async def _download_snapshot(storage_path: str) -> str:
    """Download a snapshot — handles both legacy .html (uncompressed) and new .html.gz (gzipped)."""
    raw = await storage_download("snapshots", storage_path)
    if storage_path.endswith(".gz"):
        return gzip.decompress(raw).decode("utf-8")
    # Legacy uncompressed snapshots
    return raw.decode("utf-8")


# ── Main crawl pipeline ────────────────────────────────────────────────────

async def run_crawl_job(
    pool: BrowserPool,
    monitored_page_id: str,
    url: str,
    competitor_id: str,
    user_id: str,
    page_type: str,
    crawl_job_id: str | None = None,
):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.error(f"[Crawler] Missing env vars. Skipping {url}")
        return

    logger.info(f"[Crawler] -> {url}")
    start_time = datetime.now(timezone.utc)

    if crawl_job_id:
        await db_update("crawl_jobs", {
            "status": "running",
            "started_at": start_time.isoformat(),
        }, {"id": f"eq.{crawl_job_id}"})

    # ── 0a. robots.txt — voluntary compliance. Skip + mark "completed" so we
    #       don't keep re-trying. Legal guardrail per delivery plan §10.
    if not await _is_crawl_allowed(url):
        logger.info(f"[Crawler] Skipping {url} — disallowed by robots.txt")
        await _complete_job(crawl_job_id)
        await _touch_page(monitored_page_id)
        return

    # ── 0b. HEAD prefetch — skip dead URLs without launching Playwright ─────
    should_proceed, head_status = await _head_check(url)
    if not should_proceed:
        logger.info(f"[Crawler] Skipping {url} — HEAD returned {head_status}")
        await _fail_job(crawl_job_id, f"HEAD pre-check: HTTP {head_status}")
        return

    # ── 1. Render with Playwright (free path), fallback to scrape.do on block ──
    html      = ""
    http_status = 0
    block_reason: str | None = None
    try:
        html, http_status = await _render_page(pool, url)
        if http_status >= 400:
            block_reason = f"HTTP {http_status} from Playwright"
        elif not html or len(html.strip()) < 200:
            block_reason = f"Empty page ({len(html)} bytes) from Playwright"
    except Exception as e:
        block_reason = f"Playwright error: {str(e)[:150]}"
        logger.warning(f"[Crawler] {block_reason} for {url}")

    # If direct path failed and scrape.do is configured, retry through proxy
    if block_reason and SCRAPE_DO_API_KEY:
        logger.info(f"[Crawler] Falling back to scrape.do for {url} ({block_reason})")
        try:
            html, http_status = await _render_via_scrape_do(url)
            logger.info(f"[Crawler] scrape.do unblocked {url} (HTTP {http_status}, {len(html)//1024}KB)")
        except Exception as e:
            logger.error(f"[Crawler] scrape.do also failed for {url}: {e}")
            await _fail_job(crawl_job_id, f"Direct: {block_reason} | scrape.do: {str(e)[:150]}")
            return

    # Final guards after both paths
    if not html or len(html.strip()) < 200:
        await _fail_job(crawl_job_id, f"Empty page after fallback: {len(html)} bytes")
        return
    if http_status >= 400:
        await _fail_job(crawl_job_id, f"HTTP {http_status}")
        return

    # ── 2. Extract & hash ──────────────────────────────────────────────────
    norm_lines   = extractor.extract_normalized_lines(html)
    norm_text    = "\n".join(norm_lines)
    content_hash = extractor.compute_hash(html)
    norm_hash    = extractor.compute_hash(norm_text)
    prices       = extractor.extract_prices(html)
    headings     = extractor.extract_headings(html)
    structured   = extractor.extract_by_page_type(html, page_type)

    # ── 3. Compare with last snapshot ─────────────────────────────────────
    try:
        snaps = await db_select(
            "page_snapshots",
            select="id,normalized_hash,storage_path",
            filters={"monitored_page_id": f"eq.{monitored_page_id}"},
            order="crawled_at.desc",
            limit=1,
        )
        last_snap = snaps[0] if snaps else None
    except Exception as e:
        logger.error(f"[Crawler] Snapshot fetch failed: {e}")
        await _fail_job(crawl_job_id, "Snapshot fetch failed")
        return

    if last_snap and last_snap.get("normalized_hash") == norm_hash:
        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.info(f"[Crawler] No change: {url} ({elapsed:.1f}s)")
        await _complete_job(crawl_job_id)
        await _touch_page(monitored_page_id)
        return

    # ── 4. Upload gzip-compressed snapshot ─────────────────────────────────
    ts           = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    storage_path = f"{user_id}/{competitor_id}/{monitored_page_id}/{ts}.html.gz"

    try:
        await _upload_snapshot(storage_path, html)
    except Exception as e:
        logger.error(f"[Crawler] Storage upload failed: {e}")
        await _fail_job(crawl_job_id, "Storage upload failed")
        return

    # ── 5. Insert snapshot row ─────────────────────────────────────────────
    # Schema notes:
    #   - prices_json is now JSONB on the DB side — send the raw list, not a
    #     string. PostgREST will encode it correctly.
    #   - normalized_text is needed so detect-changes can fall back when the
    #     gzipped HTML can't be downloaded.
    #   - "crawled_by" column does not exist on page_snapshots; was rejected
    #     with HTTP 400 by PostgREST. Removed.
    try:
        rows = await db_insert("page_snapshots", {
            "monitored_page_id": monitored_page_id,
            "user_id":           user_id,
            "storage_path":      storage_path,
            "content_hash":      content_hash,
            "normalized_hash":   norm_hash,
            "normalized_text":   norm_text,
            "prices_json":       prices,
            "http_status":       http_status,
            "structured_data":   structured,
            "crawled_by":        "python",
        })
        new_snap = rows[0] if rows else None
    except Exception as e:
        logger.error(f"[Crawler] Snapshot insert failed: {e}")
        await _fail_job(crawl_job_id, "Snapshot insert failed")
        return

    await _complete_job(crawl_job_id)
    await _touch_page(monitored_page_id)

    elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
    change_label = "FIRST SNAPSHOT" if not last_snap else "CHANGE DETECTED"
    logger.info(f"[Crawler] {change_label}: {url} (HTTP {http_status}, {elapsed:.1f}s)")

    if not last_snap or not new_snap:
        return

    # ── 6. AI summary ─────────────────────────────────────────────────────
    ai_summary = None
    if GEMINI_API_KEY:
        try:
            old_html     = await _download_snapshot(last_snap["storage_path"])
            old_lines    = extractor.extract_normalized_lines(old_html)
            old_text     = "\n".join(old_lines)
            old_prices   = extractor.extract_prices(old_html)
            old_headings = extractor.extract_headings(old_html)
            ai_summary   = await _ai_summarise(url, old_text, norm_text,
                                               old_headings, headings, old_prices, prices,
                                               new_html=html, new_norm_text=norm_text)
            if ai_summary:
                logger.info(f"[AI] {ai_summary.get('title','?')} [{ai_summary.get('change_type')}] severity={ai_summary.get('severity')}")
        except Exception as e:
            logger.warning(f"[AI] Pipeline error (non-fatal): {e}")

    # ── 7. Call detect-changes Edge Function (shared httpx client) ─────────
    # Compute price delta for structured storage in detected_changes.metadata
    price_delta: dict | None = None
    try:
        old_html_for_prices = await _download_snapshot(last_snap["storage_path"]) if not GEMINI_API_KEY else None
        old_prices_raw = extractor.extract_prices(old_html_for_prices) if old_html_for_prices else (
            # If we already downloaded old_html for AI, reuse it; otherwise skip
            extractor.extract_prices(await _download_snapshot(last_snap["storage_path"]))
            if not ai_summary else []
        )
        added_prices   = [p for p in prices if p not in old_prices_raw]
        removed_prices = [p for p in old_prices_raw if p not in prices]
        if added_prices or removed_prices:
            price_delta = {"added": added_prices[:10], "removed": removed_prices[:10]}
    except Exception:
        pass

    payload: dict = {
        "monitored_page_id":  monitored_page_id,
        "snapshot_before_id": last_snap["id"],
        "snapshot_after_id":  new_snap["id"],
    }
    if ai_summary:
        payload["ai_summary"] = ai_summary
    if price_delta:
        payload["price_delta"] = price_delta

    try:
        client = get_http_client()
        resp = await client.post(
            f"{SUPABASE_URL}/functions/v1/detect-changes",
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type":  "application/json",
            },
            json=payload,
        )
        if resp.is_success:
            logger.info(f"[Crawler] detect-changes OK for {url}")
        else:
            logger.warning(f"[Crawler] detect-changes {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"[Crawler] detect-changes error (non-fatal): {e}")
