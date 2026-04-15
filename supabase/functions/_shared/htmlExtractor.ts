// Strips noise from raw HTML and extracts meaningful text content

// Safe, non-backtracking patterns — each uses specific tag matching to avoid catastrophic backtracking
const SCRIPT_RE = /<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi
const STYLE_RE = /<style(?:\s[^>]*)?>[\s\S]*?<\/style>/gi
const NOSCRIPT_RE = /<noscript(?:\s[^>]*)?>[\s\S]*?<\/noscript>/gi
const SVG_RE = /<svg(?:\s[^>]*)?>[\s\S]*?<\/svg>/gi
const COMMENT_RE = /<!--[\s\S]*?-->/g

const PRICE_REGEX = /(?:[\$€£¥][\d,]+\.?\d{0,2}|\d+[.,]\d{2}\s*(?:USD|EUR|GBP|CAD|AUD))/g

const PROMOTION_KEYWORDS = [
  '% off', 'save $', 'save £', 'save €',
  'limited time', 'today only', 'flash sale', 'sale ends',
  'promo code', 'coupon code', 'use code',
  'buy one get one', 'bogo', 'free trial', 'free shipping',
  'exclusive offer', 'special offer', 'exclusive deal',
  'up to % off', 'starting from', 'as low as',
]

const PROMO_STRUCTURAL_PATTERNS = [
  /class="[^"]*(?:promo|banner|offer|sale|campaign|announcement|deal|coupon)[^"]*"/i,
  /id="[^"]*(?:promo|banner|offer|sale|campaign|announcement|deal|coupon)[^"]*"/i,
]

export function stripNoise(html: string): string {
  return html
    .replace(SCRIPT_RE, ' ')
    .replace(STYLE_RE, ' ')
    .replace(NOSCRIPT_RE, ' ')
    .replace(SVG_RE, ' ')
    .replace(COMMENT_RE, ' ')
}

export function extractText(html: string): string {
  const stripped = stripNoise(html)
  return stripped
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractNormalizedLines(html: string): string[] {
  const stripped = stripNoise(html)
  return stripped
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 2)
}

export function extractPrices(html: string): string[] {
  const text = extractText(html)
  const matches = text.match(PRICE_REGEX) ?? []
  return [...new Set(matches)]
}

export function extractLinks(html: string): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = []
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1].trim()
    const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      links.push({ href, text })
    }
  }
  return links
}

export function detectPromotionKeywords(text: string): string[] {
  const lower = text.toLowerCase()
  return PROMOTION_KEYWORDS.filter((kw) => lower.includes(kw))
}

export function hasPromoStructure(html: string): boolean {
  return PROMO_STRUCTURAL_PATTERNS.some((p) => p.test(html))
}

// SHA-256 via Web Crypto API — collision-resistant, replaces djb2
export async function computeHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Extract JSON-LD blocks BEFORE stripNoise removes <script> tags.
// Schema.org Offer/Product types give reliable, structured pricing data.
export function extractJsonLd(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = []
  const jsonLdRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = jsonLdRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1])
      const items = Array.isArray(parsed) ? parsed : [parsed]
      results.push(...items)
    } catch { /* malformed JSON-LD — skip */ }
  }
  return results
}

// Extract Open Graph and meta tag key/value pairs.
// og:title, product:price:amount etc. are stable signals unaffected by layout changes.
export function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {}
  // name/property before content
  const re1 = /<meta\s+(?:[^>]*?\s)?(?:name|property)=["']([^"']+)["'][^>]*\s+content=["']([^"']+)["'][^>]*>/gi
  let m
  while ((m = re1.exec(html)) !== null) meta[m[1].toLowerCase()] = m[2]
  // content before name/property
  const re2 = /<meta\s+content=["']([^"']+)["'][^>]*\s+(?:name|property)=["']([^"']+)["'][^>]*>/gi
  while ((m = re2.exec(html)) !== null) meta[m[2].toLowerCase()] = m[1]
  return meta
}

// Normalize price string to numeric value — prevents $99 vs $99.00 false positives
export function normalizePrice(p: string): number {
  return parseFloat(p.replace(/[^0-9.]/g, '')) || 0
}

// Page-type-aware structured extraction.
// Returns additional signals specific to the page type alongside JSON-LD and meta.
export function extractByPageType(html: string, pageType: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    jsonLd: extractJsonLd(html),
    meta: extractMetaTags(html),
  }

  if (pageType === 'pricing') {
    // Pull out headings and table content — pricing pages use these for plan names/features
    const headings: string[] = []
    const headingRe = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi
    let m
    while ((m = headingRe.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (text) headings.push(text)
    }
    const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi
    const tables: string[] = []
    while ((m = tableRe.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (text.length > 10) tables.push(text)
    }
    return { ...base, headings, tables }
  }

  if (pageType === 'blog') {
    const publishDates: string[] = []
    const timeRe = /<time[^>]*datetime=["']([^"']+)["'][^>]*>/gi
    let m
    while ((m = timeRe.exec(html)) !== null) publishDates.push(m[1])
    return { ...base, publishDates }
  }

  // promotions, landing_page, home — base signals are sufficient
  return base
}
