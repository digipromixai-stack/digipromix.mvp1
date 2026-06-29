"""
scheduler.py — Finds pages due for crawling and dispatches Playwright jobs.
Runs every 3 hours via Supabase pg_cron, or on-demand via POST /api/trigger.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from db import db_select, db_insert, db_update
from crawler import run_crawl_job, BrowserPool
from sitemap import discover_and_register

logger = logging.getLogger("digipromix")

# Concurrency tuned for t3.small (2 vCPU, 2 GB RAM) with multi-process
# Chromium. Each tab is its own renderer process; 3 parallel tabs ≈ 800 MB
# headroom for Chrome + Python + OS. Higher values caused OOM-driven
# "Target page, context or browser has been closed" crashes.
MAX_CONCURRENT_CRAWLS = 2
CRAWL_INTERVAL_HOURS  = 6
MAX_RETRIES           = 1   # one quick retry; further attempts wait for next cycle


async def _crawl_with_semaphore(sem: asyncio.Semaphore, pool: BrowserPool, page: dict):
    async with sem:
        for attempt in range(1, MAX_RETRIES + 2):
            try:
                await run_crawl_job(
                    pool=pool,
                    monitored_page_id=page["id"],
                    url=page["url"],
                    competitor_id=page["competitor_id"],
                    user_id=page["user_id"],
                    page_type=page.get("page_type") or "custom",
                    crawl_job_id=page.get("crawl_job_id"),
                )
                return  # success
            except Exception as e:
                if attempt <= MAX_RETRIES:
                    # Exponential backoff: 5s, 15s, 45s
                    wait = 5 * (3 ** (attempt - 1))
                    logger.warning(
                        f"[Scheduler] Retry {attempt}/{MAX_RETRIES} for {page['url']} in {wait}s: {e}"
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error(f"[Scheduler] All retries exhausted for {page['url']}: {e}")


async def schedule_and_dispatch_crawls(competitor_id: str | None = None):
    """
    Main dispatch loop.
    - competitor_id given -> crawl that competitor NOW (from UI button)
    - no competitor_id   -> crawl ALL pages not seen in 3 hours (auto schedule)
    """
    cycle_start = datetime.now(timezone.utc)
    label = f"competitor={competitor_id}" if competitor_id else "all"
    logger.info(f"[Scheduler] -- Cycle started [{label}] --")

    cutoff       = (cycle_start - timedelta(hours=CRAWL_INTERVAL_HOURS)).isoformat()
    twenty_min_ago = (cycle_start - timedelta(minutes=20)).isoformat()
    fifteen_min_ago = (cycle_start - timedelta(minutes=25)).isoformat()

    # ── 0. Sitemap auto-discovery — register any new competitor pages ─────────
    try:
        sm = await discover_and_register(competitor_id)
        if sm["added"] > 0:
            logger.info(f"[Scheduler] Sitemap: +{sm['added']} new pages auto-registered")
    except Exception as e:
        logger.warning(f"[Scheduler] Sitemap discovery warning (non-fatal): {e}")

    # ── 1. Clean up stale jobs ─────────────────────────────────────────────
    try:
        await db_update("crawl_jobs",
            {"status": "failed", "error_message": "Expired: never dispatched",
             "completed_at": cycle_start.isoformat()},
            {"status": "eq.queued", "created_at": f"lt.{twenty_min_ago}"})
        await db_update("crawl_jobs",
            {"status": "failed", "error_message": "Expired: timed out",
             "completed_at": cycle_start.isoformat()},
            {"status": "eq.running", "started_at": f"lt.{fifteen_min_ago}"})
    except Exception as e:
        logger.warning(f"[Scheduler] Stale job cleanup warning: {e}")

    # ── 2. Fetch active monitored pages ────────────────────────────────────
    try:
        page_filters: dict = {"is_active": "eq.true"}
        if competitor_id:
            page_filters["competitor_id"] = f"eq.{competitor_id}"

        pages_raw = await db_select(
            "monitored_pages",
            select="id,url,page_type,last_crawled_at,competitor_id",
            filters=page_filters,
        )
    except Exception as e:
        logger.error(f"[Scheduler] ERROR fetching pages: {e}")
        return

    if not pages_raw:
        logger.info(f"[Scheduler] No active pages found [{label}].")
        return

    logger.info(f"[Scheduler] Found {len(pages_raw)} active page(s) [{label}].")

    # ── 3. Fetch competitor user_ids in one query ──────────────────────────
    try:
        comp_ids  = list({p["competitor_id"] for p in pages_raw})
        comp_list = ",".join(comp_ids)
        comps = await db_select(
            "competitors",
            select="id,user_id,is_active",
            filters={"id": f"in.({comp_list})"},
        )
        comp_map = {c["id"]: c for c in comps}
    except Exception as e:
        logger.error(f"[Scheduler] ERROR fetching competitors: {e}")
        return

    # ── 4. Filter: active competitor + due for crawl ───────────────────────
    pages_due = []
    for page in pages_raw:
        comp = comp_map.get(page["competitor_id"], {})
        if not comp.get("is_active"):
            continue
        last = page.get("last_crawled_at")
        if competitor_id or not last or last < cutoff:
            pages_due.append({**page, "user_id": comp.get("user_id", "")})

    if not pages_due:
        logger.info(f"[Scheduler] All {len(pages_raw)} page(s) up-to-date. Nothing to crawl.")
        return

    # ── 5. Skip pages already being crawled ───────────────────────────────
    page_ids = [p["id"] for p in pages_due]
    id_list  = ",".join(page_ids)
    try:
        running = await db_select("crawl_jobs", select="monitored_page_id",
                                  filters={"status": "eq.running",
                                           "monitored_page_id": f"in.({id_list})"})
        queued  = await db_select("crawl_jobs", select="monitored_page_id",
                                  filters={"status": "eq.queued",
                                           "created_at": f"gte.{fifteen_min_ago}",
                                           "monitored_page_id": f"in.({id_list})"})
    except Exception as e:
        logger.warning(f"[Scheduler] Active job check warning: {e}")
        running, queued = [], []

    busy_ids       = {j["monitored_page_id"] for j in running + queued}
    pages_to_crawl = [p for p in pages_due if p["id"] not in busy_ids]

    if not pages_to_crawl:
        logger.info(f"[Scheduler] {len(busy_ids)} page(s) already running. Nothing new.")
        return

    logger.info(f"[Scheduler] Dispatching {len(pages_to_crawl)} page(s) (skipped {len(busy_ids)} busy).")

    # ── 6. Create crawl_jobs ───────────────────────────────────────────────
    try:
        jobs = await db_insert("crawl_jobs", [
            {"competitor_id": p["competitor_id"],
             "monitored_page_id": p["id"],
             "status": "queued"}
            for p in pages_to_crawl
        ])
    except Exception as e:
        logger.error(f"[Scheduler] ERROR inserting jobs: {e}")
        return

    if not jobs:
        logger.error("[Scheduler] No jobs returned after insert.")
        return

    job_map = {j["monitored_page_id"]: j["id"] for j in jobs}
    pages_with_jobs = [
        {**p, "crawl_job_id": job_map[p["id"]]}
        for p in pages_to_crawl if p["id"] in job_map
    ]

    # ── 7. Dispatch concurrently with shared BrowserPool ───────────────────
    pool = BrowserPool()
    try:
        await pool.start()
        sem     = asyncio.Semaphore(MAX_CONCURRENT_CRAWLS)
        tasks   = [asyncio.create_task(_crawl_with_semaphore(sem, pool, page))
                   for page in pages_with_jobs]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        await pool.stop()

    errors  = sum(1 for r in results if isinstance(r, Exception))
    elapsed = (datetime.now(timezone.utc) - cycle_start).total_seconds()
    avg     = elapsed / max(len(tasks), 1)
    logger.info(
        f"[Scheduler] -- Cycle complete: {len(tasks)} jobs, {errors} errors, "
        f"{elapsed:.1f}s total ({avg:.1f}s/job avg) --"
    )
