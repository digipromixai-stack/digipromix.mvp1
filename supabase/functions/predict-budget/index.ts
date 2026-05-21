/**
 * predict-budget — MVP 2.0 Budget Prediction Engine
 *
 * POST { campaign_id, daily_budget?, days? }
 *
 * Returns a heuristic prediction of how the campaign will perform before
 * a single dollar is spent. Combines:
 *   • Industry CPC baselines (static table)
 *   • Opportunity strength (detected_changes.metadata.campaign_score)
 *   • Severity multiplier
 *   • Form quality / call-to-action signal (keyword count)
 *
 * Writes predicted_leads, predicted_cpc, predicted_cpl, confidence_score
 * back onto the campaign row so the UI can show them before launch.
 *
 * Heuristic-first by design — no ML training required for MVP.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// ── Industry CPC baselines (USD) ──
// Reference values for Google Ads + Meta blend, 2024-25 averages.
// Conservative — actual CPCs vary by geo and keyword competition.
const INDUSTRY_CPC: Record<string, { cpc: number; conversion_rate: number }> = {
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
  'plumbing':       { cpc: 5.20, conversion_rate: 0.040 },
  'finance':        { cpc: 5.80, conversion_rate: 0.020 },
  'legal':          { cpc: 6.50, conversion_rate: 0.022 },
  'b2b saas':       { cpc: 3.80, conversion_rate: 0.025 },
  'software':       { cpc: 3.80, conversion_rate: 0.025 },
  'automotive':     { cpc: 2.80, conversion_rate: 0.022 },
  'default':        { cpc: 2.20, conversion_rate: 0.025 },
}

function baselineFor(industry: string | null | undefined) {
  if (!industry) return INDUSTRY_CPC.default
  const key = industry.toLowerCase().trim()
  return INDUSTRY_CPC[key] ?? INDUSTRY_CPC.default
}

function severityMultiplier(severity: string | null): number {
  switch (severity) {
    case 'high':   return 1.4   // urgent opportunities convert better
    case 'medium': return 1.1
    case 'low':    return 0.85
    default:       return 1.0
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const body = await req.json().catch(() => ({}))
    const { campaign_id, daily_budget, days = 7 } = body as {
      campaign_id?: string; daily_budget?: number; days?: number
    }
    if (!campaign_id) return json({ error: 'campaign_id required' }, 400)

    // Fetch campaign + linked detected_change for opportunity strength
    const { data: campaign } = await admin
      .from('campaigns')
      .select('id, user_id, industry, daily_budget, keywords, change_id')
      .eq('id', campaign_id).eq('user_id', user.id).single()
    if (!campaign) return json({ error: 'Campaign not found' }, 404)

    // Pull opportunity strength from the linked change (if any)
    let opportunityScore = 50  // neutral baseline
    let severity: string | null = null
    if (campaign.change_id) {
      const { data: change } = await admin
        .from('detected_changes')
        .select('severity, metadata')
        .eq('id', campaign.change_id).single()
      if (change) {
        severity = change.severity as string | null
        const meta = change.metadata as Record<string, unknown> | null
        const cs = Number(meta?.campaign_score)
        if (Number.isFinite(cs)) opportunityScore = Math.min(150, Math.max(0, cs))
      }
    }

    // Heuristic adjustments
    const baseline = baselineFor(campaign.industry as string | null)
    const sevMul   = severityMultiplier(severity)
    const oppFactor = 0.5 + (opportunityScore / 150) * 0.8   // 0.5..1.3 range
    const keywordCount = Array.isArray(campaign.keywords) ? (campaign.keywords as string[]).length : 0
    const keywordBonus = Math.min(0.15, keywordCount * 0.015) // up to +15% with 10 kws

    const adjustedCpc = baseline.cpc * (2 - oppFactor)        // stronger opportunity → cheaper clicks
    const adjustedCvr = baseline.conversion_rate * sevMul * (1 + keywordBonus)

    const budget = Number(daily_budget ?? campaign.daily_budget ?? 10)
    const dailyClicks = budget / adjustedCpc
    const dailyLeads  = dailyClicks * adjustedCvr
    const totalLeads  = dailyLeads * Math.max(1, days)
    const cpl         = dailyLeads > 0 ? budget / dailyLeads : 0

    // Confidence: how sure are we? Higher when we have an opportunity score,
    // industry match, keywords, and a non-trivial budget.
    let confidence = 0.4
    if (severity)             confidence += 0.15
    if (campaign.industry)    confidence += 0.15
    if (keywordCount >= 3)    confidence += 0.15
    if (budget >= 20)         confidence += 0.10
    confidence = Math.min(0.95, confidence)

    const prediction = {
      predicted_leads:  Math.round(totalLeads * 10) / 10,
      predicted_cpc:    Math.round(adjustedCpc * 100) / 100,
      predicted_cpl:    Math.round(cpl * 100) / 100,
      confidence_score: Math.round(confidence * 100) / 100,
      window_days:      days,
      daily_budget:     budget,
      explanation: {
        industry:           campaign.industry ?? 'unknown',
        baseline_cpc:       baseline.cpc,
        baseline_cvr:       baseline.conversion_rate,
        opportunity_score:  opportunityScore,
        severity:           severity,
        keyword_count:      keywordCount,
        adjusted_cpc:       adjustedCpc,
        adjusted_cvr:       adjustedCvr,
      },
    }

    // Persist back onto the campaign row so the UI can read it without re-running
    await admin.from('campaigns').update({
      predicted_leads:  prediction.predicted_leads,
      predicted_cpc:    prediction.predicted_cpc,
      predicted_cpl:    prediction.predicted_cpl,
      confidence_score: prediction.confidence_score,
    }).eq('id', campaign_id)

    return json(prediction)
  } catch (err) {
    console.error('predict-budget error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
