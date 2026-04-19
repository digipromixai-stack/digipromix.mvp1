import {
  extractText,
  extractLinks,
  extractPrices,
  detectPromotionKeywords,
  hasPromoStructure,
  extractCampaignSignals,
  normalizePrice,
} from './htmlExtractor.ts'

export type ChangeType =
  | 'campaign_launch'
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
  // Campaign fields
  campaign_score?: number
  promo_codes?: string[]
  action_recommended?: string
  is_coordinated?: boolean  // set externally by detect-changes after DB query
}

const BLOG_PATH_REGEX    = /\/(blog|news|articles?|insights?|posts?)\//i
const LANDING_PATH_REGEX = /\/(lp|landing|campaign|promo|offer)\//i
const UTM_REGEX          = /[?&]utm_/i
const BANNER_CLASS_REGEX = /class="[^"]*(?:hero|banner|announcement|promo-bar|sticky-bar|top-bar|notification-bar)[^"]*"/i

export function classifyChange(
  beforeHtml: string,
  afterHtml: string,
  pageUrl: string,
  beforeLines: string[],
  afterLines: string[]
): ChangeClassification {
  const hostname = (() => { try { return new URL(pageUrl).hostname } catch { return pageUrl } })()

  // ── Price extraction ─────────────────────────────────────────────────────
  const beforePrices = extractPrices(beforeHtml)
  const afterPrices  = extractPrices(afterHtml)
  const beforePriceNums = new Set(beforePrices.map(normalizePrice))
  const afterPriceNums  = new Set(afterPrices.map(normalizePrice))
  const addedPrices   = afterPrices.filter((p) => !beforePriceNums.has(normalizePrice(p)))
  const removedPrices = beforePrices.filter((p) => !afterPriceNums.has(normalizePrice(p)))

  // ── Link extraction ───────────────────────────────────────────────────────
  const beforeLinks   = extractLinks(beforeHtml).map((l) => l.href)
  const afterLinks    = extractLinks(afterHtml).map((l) => l.href)
  const beforeLinkSet = new Set(beforeLinks)
  const newLinks      = afterLinks.filter((l) => !beforeLinkSet.has(l))

  // ── New-line text (avoids re-ordered content false positives) ─────────────
  const beforeLineSet = new Set(beforeLines)
  const newLinesText  = afterLines.filter((l) => !beforeLineSet.has(l)).join(' ')
  const newLineCount  = afterLines.filter((l) => !beforeLineSet.has(l)).length

  // ── Campaign signal scoring ───────────────────────────────────────────────
  // Score the AFTER page in full — new signals that weren't present before
  const afterSignals  = extractCampaignSignals(afterHtml)
  const beforeSignals = extractCampaignSignals(beforeHtml)
  // Effective score = how much new signal appeared (delta)
  const campaignScore = Math.max(0, afterSignals.score - Math.floor(beforeSignals.score * 0.5))
  const newPromoCodes = afterSignals.promoCodes.filter((c) => !beforeHtml.includes(c))

  // ── Tier 1: Campaign Launch ──────────────────────────────────────────────
  // Score ≥ 60 OR any brand-new promo code → full campaign detected
  if (campaignScore >= 60 || newPromoCodes.length > 0) {
    return {
      change_type: 'campaign_launch',
      severity: 'high',
      title: `Campaign launched on ${hostname}`,
      description: newPromoCodes.length > 0
        ? `New promotional campaign with code${newPromoCodes.length > 1 ? 's' : ''}: ${newPromoCodes.join(', ')}`
        : `High-intensity campaign signals detected (score ${campaignScore}/150)`,
      campaign_score: campaignScore,
      promo_codes: newPromoCodes,
      action_recommended: 'Launch counter-campaign',
    }
  }

  // ── Tier 2: Promotion ────────────────────────────────────────────────────
  const promoKeywords = detectPromotionKeywords(newLinesText)
  if (campaignScore >= 35 || promoKeywords.length >= 2) {
    return {
      change_type: 'promotion',
      severity: 'high',
      title: `Promotion detected on ${hostname}`,
      description: `New promotional content: "${promoKeywords.slice(0, 3).join('", "')}"`,
      promo_keywords: promoKeywords,
      campaign_score: campaignScore,
    }
  }
  // Single promo keyword also counts (original behaviour)
  if (promoKeywords.length > 0) {
    return {
      change_type: 'promotion',
      severity: 'high',
      title: `Promotion detected on ${hostname}`,
      description: `New promotional content found: "${promoKeywords[0]}"`,
      promo_keywords: promoKeywords,
    }
  }

  // ── Tier 3: Price Change ─────────────────────────────────────────────────
  if (addedPrices.length > 0 || removedPrices.length > 0) {
    return {
      change_type: 'price_change',
      severity: 'high',
      title: `Price change detected on ${hostname}`,
      description: removedPrices.length > 0
        ? `Prices changed: ${removedPrices.join(', ')} → ${addedPrices.join(', ')}`
        : `New prices found: ${addedPrices.join(', ')}`,
      price_before: removedPrices,
      price_after: addedPrices,
    }
  }

  // ── Tier 4: New Blog Post ─────────────────────────────────────────────────
  const newBlogLinks = newLinks.filter((l) => BLOG_PATH_REGEX.test(l))
  if (newBlogLinks.length > 0) {
    return {
      change_type: 'new_blog_post',
      severity: 'medium',
      title: `New blog post on ${hostname}`,
      description: `New blog content linked: ${newBlogLinks[0]}`,
    }
  }

  // ── Tier 5: New Landing Page ──────────────────────────────────────────────
  const newLandingLinks = newLinks.filter((l) => LANDING_PATH_REGEX.test(l) || UTM_REGEX.test(l))
  if (newLandingLinks.length > 0) {
    return {
      change_type: 'new_landing_page',
      severity: 'medium',
      title: `New landing page on ${hostname}`,
      description: `New campaign/landing page detected: ${newLandingLinks[0]}`,
    }
  }

  // ── Tier 6: Banner / Structural Change ───────────────────────────────────
  const bannerInBefore = BANNER_CLASS_REGEX.test(beforeHtml)
  const bannerInAfter  = BANNER_CLASS_REGEX.test(afterHtml)
  const hasPromoNow    = hasPromoStructure(afterHtml)
  const hadPromoBefore = hasPromoStructure(beforeHtml)
  if (campaignScore >= 15 || (!bannerInBefore && bannerInAfter) || (!hadPromoBefore && hasPromoNow)) {
    return {
      change_type: 'banner_change',
      severity: 'medium',
      title: `Banner/hero section changed on ${hostname}`,
      description: 'A promotional banner or hero section appeared or changed.',
      campaign_score: campaignScore,
    }
  }

  // ── Tier 7: Generic Content Change ───────────────────────────────────────
  return {
    change_type: 'content_change',
    severity: 'low',
    title: `Content updated on ${hostname}`,
    description: `Page content changed (~${newLineCount} new lines).`,
  }
}
