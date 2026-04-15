import {
  extractText,
  extractLinks,
  extractPrices,
  detectPromotionKeywords,
  hasPromoStructure,
} from './htmlExtractor.ts'

export type ChangeType =
  | 'promotion'
  | 'price_change'
  | 'new_landing_page'
  | 'new_blog_post'
  | 'banner_change'
  | 'content_change'

export type Severity = 'low' | 'medium' | 'high'

export interface ChangeClassification {
  change_type: ChangeType
  severity: Severity
  title: string
  description: string
  price_before?: string[]
  price_after?: string[]
  promo_keywords?: string[]
}

const BLOG_PATH_REGEX = /\/(blog|news|articles?|insights?|posts?)\//i
const LANDING_PATH_REGEX = /\/(lp|landing|campaign|promo|offer)\//i
const UTM_REGEX = /[?&]utm_/i
const BANNER_CLASS_REGEX = /class="[^"]*(?:hero|banner|announcement|promo-bar|sticky-bar|top-bar|notification-bar)[^"]*"/i

// Normalize price strings to numeric values for comparison (avoids $99 vs $99.00 false positives)
function normalizePrice(p: string): number {
  return parseFloat(p.replace(/[^0-9.]/g, '')) || 0
}

export function classifyChange(
  beforeHtml: string,
  afterHtml: string,
  pageUrl: string,
  beforeLines: string[],
  afterLines: string[]
): ChangeClassification {
  const beforePrices = extractPrices(beforeHtml)
  const afterPrices = extractPrices(afterHtml)

  const beforeLinks = extractLinks(beforeHtml).map((l) => l.href)
  const afterLinks = extractLinks(afterHtml).map((l) => l.href)

  // New links that appeared
  const beforeLinkSet = new Set(beforeLinks)
  const newLinks = afterLinks.filter((l) => !beforeLinkSet.has(l))

  // Only flag promo keywords on lines that are genuinely new (not just re-ordered)
  const beforeLineSet = new Set(beforeLines)
  const newLinesText = afterLines.filter((l) => !beforeLineSet.has(l)).join(' ')

  // --- Tier 1: Promotion keywords in genuinely new lines ---
  const promoKeywords = detectPromotionKeywords(newLinesText)
  if (promoKeywords.length > 0) {
    return {
      change_type: 'promotion',
      severity: 'high',
      title: `Promotion detected on ${new URL(pageUrl).hostname}`,
      description: `New promotional content found: "${promoKeywords.slice(0, 3).join('", "')}"`,
      promo_keywords: promoKeywords,
    }
  }

  // --- Price change (normalize to avoid $99 vs $99.00 false positives) ---
  const beforePriceNums = new Set(beforePrices.map(normalizePrice))
  const afterPriceNums = new Set(afterPrices.map(normalizePrice))
  const addedPrices = afterPrices.filter((p) => !beforePriceNums.has(normalizePrice(p)))
  const removedPrices = beforePrices.filter((p) => !afterPriceNums.has(normalizePrice(p)))
  if (addedPrices.length > 0 || removedPrices.length > 0) {
    return {
      change_type: 'price_change',
      severity: 'high',
      title: `Price change detected on ${new URL(pageUrl).hostname}`,
      description: removedPrices.length > 0
        ? `Prices changed: ${removedPrices.join(', ')} → ${addedPrices.join(', ')}`
        : `New prices found: ${addedPrices.join(', ')}`,
      price_before: removedPrices,
      price_after: addedPrices,
    }
  }

  // --- New blog post ---
  const newBlogLinks = newLinks.filter((l) => BLOG_PATH_REGEX.test(l))
  if (newBlogLinks.length > 0) {
    return {
      change_type: 'new_blog_post',
      severity: 'medium',
      title: `New blog post on ${new URL(pageUrl).hostname}`,
      description: `New blog content linked: ${newBlogLinks[0]}`,
    }
  }

  // --- New landing page ---
  const newLandingLinks = newLinks.filter((l) => LANDING_PATH_REGEX.test(l) || UTM_REGEX.test(l))
  if (newLandingLinks.length > 0) {
    return {
      change_type: 'new_landing_page',
      severity: 'medium',
      title: `New landing page on ${new URL(pageUrl).hostname}`,
      description: `New campaign/landing page detected: ${newLandingLinks[0]}`,
    }
  }

  // --- Tier 2: Banner/structural change ---
  const bannerInBefore = BANNER_CLASS_REGEX.test(beforeHtml)
  const bannerInAfter = BANNER_CLASS_REGEX.test(afterHtml)
  const hasPromoNow = hasPromoStructure(afterHtml)
  const hadPromoBefore = hasPromoStructure(beforeHtml)
  if ((!bannerInBefore && bannerInAfter) || (!hadPromoBefore && hasPromoNow)) {
    return {
      change_type: 'banner_change',
      severity: 'medium',
      title: `Banner/hero section changed on ${new URL(pageUrl).hostname}`,
      description: 'A promotional banner or hero section appeared or changed.',
    }
  }

  // --- Fallback: generic content change ---
  const newLineCount = afterLines.filter((l) => !beforeLineSet.has(l)).length
  return {
    change_type: 'content_change',
    severity: 'low',
    title: `Content updated on ${new URL(pageUrl).hostname}`,
    description: `Page content changed (~${newLineCount} new lines).`,
  }
}
