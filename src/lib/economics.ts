// Single source of truth for the "value per lead" default used across
// Dashboard / Opportunities / Interception ROI & revenue estimates.
// A single lead is worth wildly different amounts across industries (a plumber's
// lead vs. a B2B SaaS lead), so this is only a fallback — profiles.value_per_lead
// (set in Settings) always takes precedence when available.
export const DEFAULT_VALUE_PER_LEAD = 100

// Per-industry CPC + conversion-rate baselines (EUR). Kept in sync with
// supabase/functions/predict-budget/index.ts's INDUSTRY_CPC table — that one
// can't be imported here (Deno edge function vs. Vite frontend), so this is a
// deliberate mirror, not an independent guess. Update both if either changes.
export const INDUSTRY_CPC: Record<string, { cpc: number; conversionRate: number }> = {
  'real-estate':    { cpc: 2.50, conversionRate: 0.025 },
  'real estate':    { cpc: 2.50, conversionRate: 0.025 },
  'healthcare':     { cpc: 3.20, conversionRate: 0.030 },
  'medical':        { cpc: 3.20, conversionRate: 0.030 },
  'dental':         { cpc: 3.00, conversionRate: 0.028 },
  'retail':         { cpc: 1.40, conversionRate: 0.035 },
  'ecommerce':      { cpc: 1.60, conversionRate: 0.030 },
  'education':      { cpc: 2.10, conversionRate: 0.045 },
  'school':         { cpc: 2.10, conversionRate: 0.045 },
  'restaurant':     { cpc: 1.20, conversionRate: 0.050 },
  'restaurants':    { cpc: 1.20, conversionRate: 0.050 },
  'local-services': { cpc: 4.50, conversionRate: 0.035 },
  'local services': { cpc: 4.50, conversionRate: 0.035 },
  'plumbing':       { cpc: 5.20, conversionRate: 0.040 },
  'finance':        { cpc: 5.80, conversionRate: 0.020 },
  'legal':          { cpc: 6.50, conversionRate: 0.022 },
  'b2b saas':       { cpc: 3.80, conversionRate: 0.025 },
  'saas':           { cpc: 3.80, conversionRate: 0.025 },
  'payments saas':  { cpc: 3.80, conversionRate: 0.025 },
  'software':       { cpc: 3.80, conversionRate: 0.025 },
  'automotive':     { cpc: 2.80, conversionRate: 0.022 },
  'default':        { cpc: 2.20, conversionRate: 0.025 },
}

export function industryBaseline(industry: string | null | undefined) {
  if (!industry) return INDUSTRY_CPC.default
  const key = industry.toLowerCase().trim()
  return INDUSTRY_CPC[key] ?? INDUSTRY_CPC.default
}

// ── Shared signal economics ────────────────────────────────────────────────
// Every page (Command Center, Opportunities, Counter Campaign) shows the
// numbers score-opportunities stored on the opportunity — never a page-local
// recalculation — so one signal reads the same everywhere.

/** Same ±30% band score-opportunities stores as metadata.leads_range. */
export function leadsRange(expected: number): { min: number; max: number } {
  const min = Math.max(1, Math.round(expected * 0.7))
  const max = Math.max(min + 1, Math.round(expected * 1.3))
  return { min, max }
}

export function formatLeadsRange(expected: number | null | undefined): string {
  if (expected == null || expected <= 0) return '—'
  const { min, max } = leadsRange(expected)
  return `${min}–${max}`
}

export interface SignalEconomics {
  leads:        number
  leadsLabel:   string        // e.g. "7–13"
  cpc:          number | null // €
  cpl:          number | null // €
  weeklyBudget: number | null // € (recommended_budget is daily)
  value:        number        // € — expected leads × value per lead
}

export function opportunityEconomics(
  opp: { expected_leads: number | null; estimated_cpc: number | null; estimated_cpl: number | null; recommended_budget: number | null },
  valuePerLead: number,
): SignalEconomics {
  const leads = opp.expected_leads ?? 0
  return {
    leads,
    leadsLabel:   formatLeadsRange(leads),
    cpc:          opp.estimated_cpc,
    cpl:          opp.estimated_cpl ?? (leads > 0 && opp.recommended_budget ? (opp.recommended_budget * 7) / leads : null),
    weeklyBudget: opp.recommended_budget != null ? opp.recommended_budget * 7 : null,
    value:        leads * valuePerLead,
  }
}
