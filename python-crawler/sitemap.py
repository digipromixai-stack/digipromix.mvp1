"""
sitemap.py — Auto-discover competitor pages from sitemap.xml / robots.txt.

Runs at the start of each crawl cycle. For each active competitor:
  1. Fetch sitemap URL (tries /sitemap.xml, /sitemap_index.xml, robots.txt Sitemap: directive)
  2. Parse all <loc> URLs (follows <sitemapindex> sub-sitemaps one level deep)
  3. Filter to high-value page types: pricing, blog, promotions, landing pages
  4. Insert new URLs into monitored_pages (skips already-tracked ones)

Keeps discovered pages lightweight — only adds, never removes existing pages.
"""

import re
import logging
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree as ET
from db import db_select, db_insert
from crawler import get_http_client

logger = logging.getLogger("digipromix")

# URL path patterns → page_type label used in monitored_pages
PAGE_TYPE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'/pric|/plan|/subscription|/billing',        re.I), 'pricing'),
    (re.compile(r'/blog|/news|/article|/post|/insights',      re.I), 'blog'),
    (re.compile(r'/promo|/offer|/sale|/deal|/discount|/coupon', re.I), 'promotions'),
    (re.compile(r'/landing|/campaign|/lp/|/go/',              re.I), 'landing_page'),
    (re.compile(r'/feature|/product|/solution|/use-case',     re.I), 'custom'),
]

# Only add pages whose paths match at least one pattern above
SKIP_PATTERNS = re.compile(
    r'\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|zip|css|js|xml|json|txt|mp4|woff)$'
    r'|/cdn-cgi/|/wp-json/|/feed/|/tag/|/author/|/page/\d',
    re.I,
)

MAX_URLS_PER_COMPETITOR = 20   # cap new pages added per cycle per competitor
SITEMAP_TIMEOUT = 10.0


def _classify_url(url: str) -> str | None:
    """Return page_type for a URL, or None if it should be skipped."""
    path = urlparse(url).path
    if SKIP_PATTERNS.search(path):
        return None
    for pattern, page_type in PAGE_TYPE_PATTERNS:
        if pattern.search(path):
            return page_type
    return None


async def _fetch_text(url: str) -> str | None:
    try:
        client = get_http_client()
        r = await client.get(url, timeout=SITEMAP_TIMEOUT,
                             headers={"User-Agent": "DigiPromix-Bot/2.2.6"})
        if r.status_code == 200:
            return r.text
    except Exception:
        pass
    return None


async def _resolve_sitemap_url(base_url: str) -> str | None:
    """Try common sitemap locations + robots.txt Sitemap: directive."""
    candidates = [
        f"{base_url}/sitemap.xml",
        f"{base_url}/sitemap_index.xml",
        f"{base_url}/sitemap/sitemap.xml",
    ]
    # Check robots.txt for Sitemap: directive
    robots = await _fetch_text(f"{base_url}/robots.txt")
    if robots:
        for line in robots.splitlines():
            if line.lower().startswith("sitemap:"):
                sm_url = line.split(":", 1)[1].strip()
                if sm_url:
                    candidates.insert(0, sm_url)

    for url in candidates:
        text = await _fetch_text(url)
        if text and ('<urlset' in text or '<sitemapindex' in text):
            return url
    return None


def _parse_locs(xml_text: str) -> list[str]:
    """Extract all <loc> values from a sitemap or sitemap index XML."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    locs = []
    for el in root.findall('.//sm:loc', ns):
        if el.text:
            locs.append(el.text.strip())
    # Also handle no-namespace variants
    if not locs:
        for el in root.iter():
            if el.tag.endswith('loc') and el.text:
                locs.append(el.text.strip())
    return locs


async def _collect_urls(sitemap_url: str) -> list[str]:
    """Fetch sitemap, follow sitemapindex one level deep, return all page URLs."""
    text = await _fetch_text(sitemap_url)
    if not text:
        return []
    locs = _parse_locs(text)
    if not locs:
        return []

    # If it's a sitemap index, fetch each child sitemap (cap at 5 sub-sitemaps)
    if '<sitemapindex' in text:
        all_urls: list[str] = []
        for sub_url in locs[:5]:
            sub_text = await _fetch_text(sub_url)
            if sub_text:
                all_urls.extend(_parse_locs(sub_text))
        return all_urls

    return locs


async def discover_and_register(competitor_id: str | None = None) -> dict:
    """
    Main entry point. Call at the start of each crawl cycle.
    Returns summary dict with counts of discovered / added pages.
    """
    total_discovered = 0
    total_added = 0

    try:
        filters: dict = {"is_active": "eq.true"}
        if competitor_id:
            filters["id"] = f"eq.{competitor_id}"
        competitors = await db_select(
            "competitors",
            select="id,user_id,name,website_url",
            filters=filters,
        )
    except Exception as e:
        logger.error(f"[Sitemap] Failed to fetch competitors: {e}")
        return {"discovered": 0, "added": 0}

    for comp in competitors:
        comp_id    = comp["id"]
        user_id    = comp["user_id"]
        name       = comp["name"]
        website    = (comp.get("website_url") or "").rstrip("/")
        if not website:
            continue

        # Parse origin (scheme + host only)
        try:
            parsed = urlparse(website)
            origin = f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            continue

        sitemap_url = await _resolve_sitemap_url(origin)
        if not sitemap_url:
            logger.info(f"[Sitemap] No sitemap found for {name} ({origin})")
            continue

        urls = await _collect_urls(sitemap_url)
        if not urls:
            logger.info(f"[Sitemap] Empty sitemap for {name}")
            continue

        total_discovered += len(urls)

        # Filter to high-value pages only
        candidates: list[tuple[str, str]] = []
        for url in urls:
            page_type = _classify_url(url)
            if page_type:
                candidates.append((url, page_type))
            if len(candidates) >= MAX_URLS_PER_COMPETITOR * 3:
                break

        if not candidates:
            continue

        # Fetch existing monitored URLs for this competitor (avoid duplicates)
        try:
            existing = await db_select(
                "monitored_pages",
                select="url",
                filters={"competitor_id": f"eq.{comp_id}"},
            )
            existing_urls = {r["url"] for r in existing}
        except Exception as e:
            logger.warning(f"[Sitemap] Could not fetch existing pages for {name}: {e}")
            existing_urls = set()

        new_rows = []
        for url, page_type in candidates:
            if url not in existing_urls:
                new_rows.append({
                    "competitor_id": comp_id,
                    "user_id":       user_id,
                    "url":           url,
                    "page_type":     page_type,
                    "is_active":     True,
                    "auto_discovered": True,
                })
                existing_urls.add(url)
            if len(new_rows) >= MAX_URLS_PER_COMPETITOR:
                break

        if not new_rows:
            logger.info(f"[Sitemap] {name}: no new pages to add ({len(candidates)} candidates already tracked)")
            continue

        try:
            await db_insert("monitored_pages", new_rows)
            total_added += len(new_rows)
            labels = [f"{r['url']} ({r['page_type']})" for r in new_rows[:3]]
            logger.info(f"[Sitemap] {name}: added {len(new_rows)} new page(s): {labels}")
        except Exception as e:
            logger.warning(f"[Sitemap] Insert failed for {name}: {e}")

    logger.info(f"[Sitemap] Cycle complete — discovered {total_discovered} URLs, added {total_added} new pages")
    return {"discovered": total_discovered, "added": total_added}
