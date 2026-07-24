/**
 * Shared industry CPC / conversion-rate heuristic — the fallback used by
 * predict-budget, forecast-campaign, and score-opportunities whenever a live
 * platform forecast isn't available (no connected ad account, or the live
 * call failed). Single source of truth so the three call sites can't drift
 * out of sync with each other (they used to each keep their own copy).
 *
 * Mirrored client-side in src/lib/economics.ts (Deno edge functions can't
 * import from the Vite app, so that copy has to stay a deliberate mirror —
 * update both if either changes).
 */

export interface IndustryBaseline {
  cpc: number
  conversion_rate: number
}

export const INDUSTRY_CPC: Record<string, IndustryBaseline> = {
  'real-estate':    { cpc: 2.50, conversion_rate: 0.025 },
  'real estate':    { cpc: 2.50, conversion_rate: 0.025 },
  'healthcare':     { cpc: 3.20, conversion_rate: 0.030 },
  'medical':        { cpc: 3.20, conversion_rate: 0.030 },
  'dental':         { cpc: 3.00, conversion_rate: 0.028 },
  'retail':         { cpc: 1.40, conversion_rate: 0.035 },
  'ecommerce':      { cpc: 1.60, conversion_rate: 0.030 },
  'education':      { cpc: 2.10, conversion_rate: 0.045 },
  'school':         { cpc: 2.10, conversion_rate: 0.045 },
  'restaurant':     { cpc: 1.20, conversion_rate: 0.050 },
  'restaurants':    { cpc: 1.20, conversion_rate: 0.050 },
  'local services': { cpc: 4.50, conversion_rate: 0.035 },
  'local-services': { cpc: 4.50, conversion_rate: 0.035 },
  'plumbing':       { cpc: 5.20, conversion_rate: 0.040 },
  'finance':        { cpc: 5.80, conversion_rate: 0.020 },
  'legal':          { cpc: 6.50, conversion_rate: 0.022 },
  'b2b saas':       { cpc: 3.80, conversion_rate: 0.025 },
  'saas':           { cpc: 3.80, conversion_rate: 0.025 },
  'software':       { cpc: 3.80, conversion_rate: 0.025 },
  'payments saas':  { cpc: 3.80, conversion_rate: 0.025 },
  'automotive':     { cpc: 2.80, conversion_rate: 0.022 },
  default:          { cpc: 2.20, conversion_rate: 0.025 },
}

export function baselineFor(industry: string | null | undefined): IndustryBaseline {
  if (!industry) return INDUSTRY_CPC.default
  const key = industry.toLowerCase().trim()
  return INDUSTRY_CPC[key] ?? INDUSTRY_CPC.default
}

export function severityMultiplier(severity: string | null | undefined): number {
  switch (severity) {
    case 'high':   return 1.4   // urgent opportunities convert better
    case 'medium': return 1.1
    case 'low':    return 0.85
    default:       return 1.0
  }
}

export interface HeuristicInput {
  budget:            number
  days:              number
  industry:          string | null
  severity:          string | null
  opportunityScore:  number   // 0..150, 50 = neutral
  keywordCount:      number
}

export interface HeuristicResult {
  predicted_leads:   number
  predicted_cpc:     number
  predicted_cpl:     number
  confidence_score:  number
  explanation: {
    industry:          string
    baseline_cpc:      number
    baseline_cvr:      number
    opportunity_score: number
    severity:          string | null
    keyword_count:     number
    adjusted_cpc:      number
    adjusted_cvr:      number
  }
}

/**
 * The industry-CPC-table heuristic. No ML, no live data — a deterministic
 * function of (industry, severity, opportunity score, keyword count, budget)
 * so it's cheap enough to run per-opportunity in a cron (score-opportunities)
 * as well as synchronously in the UI (predict-budget / forecast-campaign).
 */
export function computeHeuristicForecast(input: HeuristicInput): HeuristicResult {
  const baseline = baselineFor(input.industry)
  const sevMul   = severityMultiplier(input.severity)
  const oppFactor = 0.5 + (Math.min(150, Math.max(0, input.opportunityScore)) / 150) * 0.8   // 0.5..1.3
  const keywordBonus = Math.min(0.15, input.keywordCount * 0.015) // up to +15% with 10 kws

  const adjustedCpc = baseline.cpc * (2 - oppFactor)        // stronger opportunity → cheaper clicks
  const adjustedCvr = baseline.conversion_rate * sevMul * (1 + keywordBonus)

  const budget = Math.max(0, input.budget)
  const days   = Math.max(1, input.days)
  const dailyClicks = adjustedCpc > 0 ? budget / adjustedCpc : 0
  const dailyLeads  = dailyClicks * adjustedCvr
  const totalLeads  = dailyLeads * days
  const cpl         = dailyLeads > 0 ? budget / dailyLeads : 0

  // Confidence: how sure are we? Higher when we have an opportunity score,
  // industry match, keywords, and a non-trivial budget.
  let confidence = 0.4
  if (input.severity)             confidence += 0.15
  if (input.industry)             confidence += 0.15
  if (input.keywordCount >= 3)    confidence += 0.15
  if (budget >= 20)                confidence += 0.10
  confidence = Math.min(0.95, confidence)

  return {
    predicted_leads:  Math.round(totalLeads * 10) / 10,
    predicted_cpc:    Math.round(adjustedCpc * 100) / 100,
    predicted_cpl:    Math.round(cpl * 100) / 100,
    confidence_score: Math.round(confidence * 100) / 100,
    explanation: {
      industry:           input.industry ?? 'unknown',
      baseline_cpc:       baseline.cpc,
      baseline_cvr:       baseline.conversion_rate,
      opportunity_score:  input.opportunityScore,
      severity:           input.severity ?? null,
      keyword_count:      input.keywordCount,
      adjusted_cpc:       adjustedCpc,
      adjusted_cvr:       adjustedCvr,
    },
  }
}
