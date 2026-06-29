"""
extractor.py — Accurate HTML content extraction for competitor monitoring.
Uses BeautifulSoup + lxml for reliable parsing, regex for speed on targeted patterns.
"""

import re
import json
import hashlib
from bs4 import BeautifulSoup, Tag
from typing import List, Dict, Any, Optional

# ── Price & keyword regexes ────────────────────────────────────────────────
PRICE_REGEX = re.compile(
    r'(?:[\$€£¥₹]\s*[\d,]+\.?\d{0,2}|\d+[.,]\d{2}\s*(?:USD|EUR|GBP|CAD|AUD|INR))',
    re.IGNORECASE,
)

PROMOTION_KEYWORDS = [
    '% off', 'save $', 'save £', 'save €', 'save ₹',
    'limited time', 'today only', 'flash sale', 'sale ends',
    'promo code', 'coupon code', 'use code',
    'buy one get one', 'bogo', 'free trial', 'free shipping',
    'exclusive offer', 'special offer', 'exclusive deal',
    'up to % off', 'starting from', 'as low as',
    'early access', 'launch offer', 'introductory price',
    'ends tonight', 'hurry', 'limited stock',
    # OAT-suggested urgency phrases
    'only left in stock', 'selling fast', 'low stock', 'last chance',
    'expires in', 'offer ends', 'act now', 'book now', 'claim now',
    "don't miss out", 'spots available', 'limited seats',
    'while stocks last', 'time limited', 'valid until',
]

# Strikethrough price patterns — indicate a discount / markdown is active
STRIKETHROUGH_PATTERNS = [
    re.compile(r'<(?:del|s|strike)[^>]*>.*?</(?:del|s|strike)>', re.IGNORECASE | re.DOTALL),
    re.compile(
        r'class="[^"]*(?:original[_-]price|was[_-]price|old[_-]price|crossed[_-]price|line[_-]through|strike[_-]through|regular[_-]price)[^"]*"',
        re.IGNORECASE,
    ),
]

# Countdown timer patterns — active campaigns typically include a visible timer
COUNTDOWN_PATTERNS = [
    re.compile(r'(?:id|class)="[^"]*(?:countdown|count-down|timer|flip-clock|offer-timer)[^"]*"', re.IGNORECASE),
    re.compile(r'data-countdown|data-end-time|data-timer|data-deadline', re.IGNORECASE),
    re.compile(r'(?:id|class)="[^"]*(?:hours|minutes|seconds)[^"]*".*?(?:id|class)="[^"]*(?:hours|minutes|seconds)', re.IGNORECASE | re.DOTALL),
]

PROMO_STRUCTURAL_PATTERNS = [
    re.compile(
        r'class="[^"]*(?:promo|banner|offer|sale|campaign|announcement|deal|coupon|ribbon|badge)[^"]*"',
        re.IGNORECASE,
    ),
    re.compile(
        r'id="[^"]*(?:promo|banner|offer|sale|campaign|announcement|deal|coupon)[^"]*"',
        re.IGNORECASE,
    ),
]

CTA_BUTTON_TAGS = {'a', 'button'}
CTA_CLASS_RE = re.compile(
    r'btn|button|cta|get.started|sign.up|try.free|start.trial|buy.now|subscribe|learn.more|contact.us',
    re.IGNORECASE,
)

NAV_SECTION_TAGS = {'nav', 'header', 'footer'}


# ── Helpers ────────────────────────────────────────────────────────────────

def _make_soup(html: str) -> BeautifulSoup:
    """Return a BeautifulSoup tree, preferring lxml for speed."""
    try:
        return BeautifulSoup(html, 'lxml')
    except Exception:
        return BeautifulSoup(html, 'html.parser')


def _clean_text(text: str) -> str:
    """Normalise whitespace and decode common HTML entities."""
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&nbsp;', ' ').replace('&quot;', '"').replace('&#39;', "'")
    return re.sub(r'\s+', ' ', text).strip()


def strip_noise(html: str) -> str:
    """Remove scripts, styles, SVGs, noscripts, and HTML comments."""
    soup = _make_soup(html)
    for el in soup(['script', 'style', 'noscript', 'svg', 'iframe']):
        el.decompose()
    cleaned = str(soup)
    return re.sub(r'<!--[\s\S]*?-->', ' ', cleaned)


# ── Core extraction ────────────────────────────────────────────────────────

def extract_text(html: str) -> str:
    stripped = strip_noise(html)
    text = re.sub(r'<[^>]+>', ' ', stripped)
    return _clean_text(text)


def extract_normalized_lines(html: str) -> List[str]:
    """Return a de-noised list of meaningful text lines from the page."""
    stripped = strip_noise(html)
    for tag in ['br', 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'section', 'article']:
        stripped = re.sub(rf'</{tag}>', '\n', stripped, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', stripped)
    text = _clean_text(text.replace('\n', '\n'))  # decode entities
    lines = []
    for raw in text.split('\n'):
        line = re.sub(r'\s+', ' ', raw).strip()
        if len(line) > 3:
            lines.append(line)
    return lines


def extract_prices(html: str) -> List[str]:
    text = extract_text(html)
    matches = PRICE_REGEX.findall(text)
    # Normalise formatting: strip internal spaces
    clean = [re.sub(r'\s+', '', m).strip() for m in matches]
    return list(dict.fromkeys(clean))


def compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


# ── Structured extraction ──────────────────────────────────────────────────

def extract_headings(html: str) -> List[Dict[str, Any]]:
    """Return all h1-h3 headings as [{level, text}], de-duplicated."""
    soup = _make_soup(html)
    seen, results = set(), []
    for tag in soup.find_all(['h1', 'h2', 'h3']):
        text = _clean_text(tag.get_text())
        if text and text not in seen and len(text) > 2:
            seen.add(text)
            results.append({'level': int(tag.name[1]), 'text': text})
    return results


def extract_cta_buttons(html: str) -> List[str]:
    """Return text of CTA buttons and links (deduped, max 15)."""
    soup = _make_soup(html)
    seen, results = set(), []
    for tag in soup.find_all(['a', 'button']):
        classes = ' '.join(tag.get('class', []))
        text = _clean_text(tag.get_text())
        if not text or len(text) < 2 or len(text) > 80:
            continue
        is_cta = CTA_CLASS_RE.search(classes) or CTA_CLASS_RE.search(text)
        if is_cta and text not in seen:
            seen.add(text)
            results.append(text)
            if len(results) >= 15:
                break
    return results


def extract_links(html: str) -> List[Dict[str, str]]:
    """Return [{href, text}] for all non-fragment links."""
    soup = _make_soup(html)
    links = []
    for a in soup.find_all('a', href=True):
        href = a['href'].strip()
        if href and not href.startswith('#') and not href.startswith('javascript'):
            text = _clean_text(a.get_text())
            links.append({'href': href, 'text': text[:120]})
    return links


def extract_meta_tags(html: str) -> Dict[str, str]:
    meta: Dict[str, str] = {}
    # name/property + content in any order
    for pat in [
        re.compile(r'<meta\s+(?:[^>]*?\s)?(?:name|property)=["\']([^"\']+)["\'][^>]*\s+content=["\']([^"\']+)["\'][^>]*>', re.IGNORECASE),
        re.compile(r'<meta\s+content=["\']([^"\']+)["\'][^>]*\s+(?:name|property)=["\']([^"\']+)["\'][^>]*>', re.IGNORECASE),
    ]:
        for m in pat.finditer(html):
            key, val = (m.group(1).lower(), m.group(2)) if 'content' not in m.group(0)[:30] else (m.group(2).lower(), m.group(1))
            meta[key] = val
    return meta


def extract_og_data(html: str) -> Dict[str, str]:
    """Return Open Graph and Twitter card metadata."""
    meta = extract_meta_tags(html)
    og: Dict[str, str] = {}
    for k, v in meta.items():
        if k.startswith('og:') or k.startswith('twitter:'):
            og[k] = v
    return og


def extract_json_ld(html: str) -> List[Dict[str, Any]]:
    results = []
    pattern = re.compile(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
        re.IGNORECASE,
    )
    for m in pattern.finditer(html):
        try:
            parsed = json.loads(m.group(1))
            if isinstance(parsed, list):
                results.extend(parsed)
            else:
                results.append(parsed)
        except json.JSONDecodeError:
            pass
    return results


def detect_promotion_keywords(text: str) -> List[str]:
    lower = text.lower()
    return [kw for kw in PROMOTION_KEYWORDS if kw in lower]


def has_promo_structure(html: str) -> bool:
    return any(p.search(html) for p in PROMO_STRUCTURAL_PATTERNS)


def has_strikethrough_prices(html: str) -> bool:
    """Detect discount/markdown signals via strikethrough price elements."""
    return any(p.search(html) for p in STRIKETHROUGH_PATTERNS)


def has_countdown_timer(html: str) -> bool:
    """Detect countdown timer elements — strong indicator of a live campaign."""
    return any(p.search(html) for p in COUNTDOWN_PATTERNS)


def detect_tracking_pixels(html: str) -> List[str]:
    """
    Identify active ad tracking pixels. Presence of these indicates the page
    is part of a running paid campaign (Meta, Google, LinkedIn).
    """
    found: List[str] = []
    if re.search(r'fbq\s*\(|_fbq\s*\(|facebook\.com/tr\?', html, re.IGNORECASE):
        found.append('meta_pixel')
    if re.search(r'gtag\s*\(|ga\s*\(|googletagmanager\.com', html, re.IGNORECASE):
        found.append('google_analytics')
    if re.search(r'linkedin\.com/px|_linkedin_partner|lintrk\s*\(', html, re.IGNORECASE):
        found.append('linkedin_insight')
    return found


def extract_key_sections(html: str) -> Dict[str, str]:
    """
    Extract text content from semantically important sections:
    hero, pricing/plans, features, navbar, footer CTA.
    Returns a dict of section_name → text (up to 600 chars each).
    """
    soup = _make_soup(html)
    sections: Dict[str, str] = {}

    # Pattern → section name
    section_patterns = [
        (re.compile(r'hero|banner|jumbotron|headline|above.the.fold', re.I), 'hero'),
        (re.compile(r'pric|plan|tier|subscription', re.I), 'pricing'),
        (re.compile(r'feature|benefit|why.us|how.it.works', re.I), 'features'),
        (re.compile(r'testimonial|review|customer|trust', re.I), 'social_proof'),
        (re.compile(r'faq|frequent', re.I), 'faq'),
    ]

    def tag_matches(tag: Tag, pattern: re.Pattern) -> bool:
        classes = ' '.join(tag.get('class', []))
        id_attr = tag.get('id', '')
        return bool(pattern.search(classes) or pattern.search(id_attr))

    for tag in soup.find_all(['section', 'div', 'article', 'header'], limit=200):
        for pattern, name in section_patterns:
            if name not in sections and tag_matches(tag, pattern):
                text = _clean_text(tag.get_text())[:600]
                if len(text) > 40:
                    sections[name] = text
                break  # don't double-count the same tag

    return sections


# ── Page-type specific extraction ──────────────────────────────────────────

def extract_by_page_type(html: str, page_type: str) -> Dict[str, Any]:
    base: Dict[str, Any] = {
        'jsonLd':               extract_json_ld(html),
        'meta':                 extract_meta_tags(html),
        'og':                   extract_og_data(html),
        'headings':             extract_headings(html),
        'cta':                  extract_cta_buttons(html),
        'sections':             extract_key_sections(html),
        # Campaign intensity signals (OAT §1.1)
        'hasStrikethroughPrices': has_strikethrough_prices(html),
        'hasCountdownTimer':      has_countdown_timer(html),
        'trackingPixels':         detect_tracking_pixels(html),
    }

    if page_type == 'pricing':
        # Pull table content and all price mentions for pricing pages
        soup = _make_soup(html)
        tables = []
        for tbl in soup.find_all('table'):
            text = _clean_text(tbl.get_text())[:500]
            if len(text) > 10:
                tables.append(text)
        base['tables'] = tables
        base['prices'] = extract_prices(html)
        return base

    if page_type == 'blog':
        # Grab post publish dates
        soup = _make_soup(html)
        dates = [t.get('datetime', '') for t in soup.find_all('time') if t.get('datetime')]
        base['publishDates'] = dates
        return base

    if page_type == 'promotions':
        base['prices']        = extract_prices(html)
        base['promoKeywords'] = detect_promotion_keywords(extract_text(html))
        return base

    return base
