/**
 * forecast-campaign — Live Platform Forecast Engine
 *
 * POST { campaign_id, daily_budget?, days?, target_countries?, age_min?, age_max? }
 *
 * Canonical replacement for predict-budget's static heuristic-only prediction.
 * Tries the user's connected Google Ads / Meta ad accounts' own forecast
 * endpoints first (real auction data for that specific account); falls back
 * to the industry-CPC heuristic when no account is connected or the live
 * call errors. See _shared/forecast-engine.ts for the full merge logic and
 * for exactly what is/isn't genuinely platform-sourced.
 *
 * Writes predicted_leads, predicted_cpc, predicted_cpl, confidence_score
 * back onto the campaign row (same contract as predict-budget) so existing
 * readers keep working; the extra `source` / `per_platform` fields in the
 * response let the UI label live-forecast vs. benchmark-estimate numbers.
 *
 * predict-budget is kept as a thin legacy wrapper around the same engine
 * (see supabase/functions/predict-budget/index.ts) so the two can never
 * disagree with each other.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runForecast } from '../_shared/forecast-engine.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
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
    const {
      campaign_id, daily_budget, days = 7,
      target_countries, age_min, age_max,
    } = body as {
      campaign_id?: string; daily_budget?: number; days?: number
      target_countries?: string[]; age_min?: number; age_max?: number
    }
    if (!campaign_id) return json({ error: 'campaign_id required' }, 400)

    const { data: campaign } = await admin
      .from('campaigns')
      .select('id, user_id, industry, daily_budget, keywords, change_id')
      .eq('id', campaign_id).eq('user_id', user.id).single()
    if (!campaign) return json({ error: 'Campaign not found' }, 404)

    // Opportunity strength from the linked change (if any) — same signal
    // predict-budget has always used to bias the heuristic baseline.
    let opportunityScore = 50
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

    const budget = Number(daily_budget ?? campaign.daily_budget ?? 10)
    const result = await runForecast(admin, user.id, {
      budget,
      days,
      industry: campaign.industry as string | null,
      severity,
      opportunityScore,
      keywords: (campaign.keywords as string[] | null) ?? [],
      countries: Array.isArray(target_countries) && target_countries.length > 0 ? target_countries : undefined,
      ageMin: typeof age_min === 'number' ? age_min : undefined,
      ageMax: typeof age_max === 'number' ? age_max : undefined,
    })

    await admin.from('campaigns').update({
      predicted_leads:  result.predicted_leads,
      predicted_cpc:    result.predicted_cpc,
      predicted_cpl:    result.predicted_cpl,
      confidence_score: result.confidence_score,
    }).eq('id', campaign_id)

    return json(result)
  } catch (err) {
    console.error('forecast-campaign error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
