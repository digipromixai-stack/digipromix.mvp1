/**
 * score-opportunities — MVP 2.0 AI Opportunity Radar
 *
 * Reads recent `detected_changes` (last 48h), scores each one using a
 * heuristic-first model (per the MVP 2.0 delivery plan), and upserts a row
 * into `opportunities` so the frontend Opportunity Feed has something to show.
 *
 * Heuristic — NOT an LLM call. Cheap, deterministic, idempotent. The plan
 * explicitly calls for heuristic-first scoring at MVP scale.
 *
 * Scoring formula (0–100):
 *   severity_weight    +  change_type_weight  +  coordination_bonus
 *   + normalized_campaign_score  +  recency_factor
 *
 * POST {}             — no body needed
 * POST { user_id }    — score only one user's signals (optional)
 *
 * verify_jwt is OFF — invoked by pg_cron and internal scripts only.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// ── Scoring weights ─────────────────────────────────────────────────────────

const CHANGE_TYPE_WEIGHT: Record<string, number> = {
  campaign_launch:  30,
  promotion:        25,
  price_change:     25,
  new_landing_page: 20,
  banner_change:    15,
  new_blog_post:    10,
  content_change:    5,
}

const SEVERITY_WEIGHT: Record<string, number> = {
  high:   40,
  medium: 25,
  low:    10,
}

// Industry CPC + conversion baselines — kept in sync with predict-budget/index.ts
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
  'payments saas':  { cpc: 3.80, conversion_rate: 0.025 },
  'automotive':     { cpc: 2.80, conversion_rate: 0.022 },
  default:          { cpc: 2.20, conversion_rate: 0.025 },
}

function baselineFor(industry: string | null | undefined) {
  if (!industry) return INDUSTRY_CPC.default
  return INDUSTRY_CPC[industry.toLowerCase().trim()] ?? INDUSTRY_CPC.default
}

// Recency factor: 0.0 (just-detected, very recent) → 1.0 (>= 48h old)
// Recent signals get up to +20 points; old signals get 0.
function recencyBonus(detectedAt: string): number {
  const ageMs    = Date.now() - new Date(detectedAt).getTime()
  const ageHours = Math.max(0, ageMs / (1000 * 60 * 60))
  if (ageHours <= 1)  return 20
  if (ageHours <= 6)  return 15
  if (ageHours <= 24) return 10
  if (ageHours <= 48) return 5
  return 0
}

// ── Recommended-action templates ────────────────────────────────────────────

function suggestAction(changeType: string, score: number): string {
  if (score >= 75) {
    switch (changeType) {
      case 'campaign_launch':  return 'Launch a counter-campaign now — competitor just went live.'
      case 'promotion':        return 'Match or beat this promo with a counter-offer today.'
      case 'price_change':     return 'Review pricing positioning and run a value-led campaign.'
      case 'new_landing_page': return 'Clone the landing structure with better copy + offer.'
      default:                 return 'Capitalise on the market move — high-impact opportunity.'
    }
  }
  if (score >= 50) {
    return 'Worth a counter-campaign — moderate opportunity, plan a 7-day test.'
  }
  return 'Watch & learn — track the trend before committing budget.'
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const reqBody = await req.json().catch(() => ({}))
    const onlyUser     = (reqBody as { user_id?: string }).user_id ?? null
    const windowHours  = Math.min(8760, Math.max(1, Number((reqBody as { window_hours?: number }).window_hours) || 48))

    // ── Pull recent changes that don't yet have an opportunity row ───────
    let query = admin
      .from('detected_changes')
      .select(`
        id, user_id, change_type, severity, title, description,
        metadata, detected_at,
        competitor_id,
        competitors ( name, industry )
      `)
      .gte('detected_at', new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString())
      .order('detected_at', { ascending: false })
      .limit(500)

    if (onlyUser) query = query.eq('user_id', onlyUser)

    const { data: changes, error: changesErr } = await query
    if (changesErr) return json({ error: 'Failed to read changes', detail: changesErr.message }, 500)

    if (!changes || changes.length === 0) {
      return json({ scored: 0, reason: 'no_recent_changes' })
    }

    // ── Skip changes already turned into opportunities ───────────────────
    // We store the source change_id in metadata.source_change_id since the
    // opportunities.signal_id column FKs to the `signals` table (different
    // entity).
    const changeIds = changes.map((c) => c.id)
    const { data: existing } = await admin
      .from('opportunities')
      .select('metadata')
      .in('metadata->>source_change_id', changeIds)

    const alreadyScored = new Set(
      (existing ?? [])
        .map((o) => (o.metadata as { source_change_id?: string } | null)?.source_change_id)
        .filter((id): id is string => !!id)
    )
    const todo = changes.filter((c) => !alreadyScored.has(c.id))

    if (todo.length === 0) {
      return json({ scored: 0, considered: changes.length, reason: 'all_already_scored' })
    }

    // ── Score each + build the opportunity rows ──────────────────────────
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const rows = todo.map((change) => {
      const competitor = change.competitors as { name: string; industry: string | null } | null
      const industry   = competitor?.industry ?? null
      const meta       = (change.metadata as Record<string, unknown> | null) ?? {}

      // ── Score ────────────────────────────────────────────────────────
      const sevScore     = SEVERITY_WEIGHT[change.severity as string]   ?? 10
      const typeScore    = CHANGE_TYPE_WEIGHT[change.change_type as string] ?? 5
      const coordBonus   = (meta.is_coordinated === true) ? 15 : 0
      const campaignSig  = Number(meta.campaign_score ?? 0)
      const sigBonus     = Math.min(15, Math.max(0, (campaignSig / 150) * 15))
      const recency      = recencyBonus(change.detected_at as string)
      const rawScore     = sevScore + typeScore + coordBonus + sigBonus + recency
      const score        = Math.min(100, Math.max(0, rawScore))

      // ── Economic projection (consistent with predict-budget) ─────────
      const baseline      = baselineFor(industry)
      const sevMul        = change.severity === 'high' ? 1.4 : change.severity === 'medium' ? 1.1 : 0.85
      const oppFactor     = 0.5 + (score / 100) * 0.8           // 0.5..1.3
      const adjustedCpc   = baseline.cpc * (2 - oppFactor)       // higher score → cheaper clicks
      const adjustedCvr   = baseline.conversion_rate * sevMul
      const recBudget     = Math.max(10, Math.round((adjustedCpc * 30)))  // ~30 clicks/day
      // expected_leads is INTEGER in the DB — round to whole number
      const expectedLeadsRaw = ((recBudget * 7) / adjustedCpc) * adjustedCvr
      const expectedLeads    = Math.max(0, Math.round(expectedLeadsRaw))
      const cpl              = expectedLeads > 0 ? Math.round((recBudget * 7 / expectedLeads) * 100) / 100 : 0

      // ── Confidence (0..1) ────────────────────────────────────────────
      let confidence = 0.40
      if (industry)                       confidence += 0.15
      if (change.severity === 'high')     confidence += 0.15
      if (meta.is_coordinated === true)   confidence += 0.10
      if (campaignSig > 50)               confidence += 0.10
      if (recency >= 15)                  confidence += 0.05
      confidence = Math.min(0.95, confidence)

      return {
        user_id:           change.user_id,
        // signal_id stays NULL — it FKs to the `signals` table which doesn't
        // yet hold per-detected_change rows. The source change_id is preserved
        // in metadata.source_change_id below for traceability + de-dup lookup.
        signal_id:         null,
        title:             change.title ?? `${industry ?? 'Market'} signal: ${change.change_type}`,
        description:       change.description,
        industry,
        location:          null,
        market_name:       competitor?.name ?? null,
        opportunity_score: Math.round(score * 10) / 10,
        expected_leads:    expectedLeads,
        estimated_cpc:     Math.round(adjustedCpc * 100) / 100,
        estimated_cpl:     cpl,
        recommended_budget: recBudget,
        confidence:        Math.round(confidence * 100) / 100,
        recommended_action: suggestAction(change.change_type as string, score),
        reasoning: [
          `severity=${change.severity} (+${sevScore})`,
          `type=${change.change_type} (+${typeScore})`,
          coordBonus ? `coordinated (+${coordBonus})` : null,
          sigBonus  ? `signal_intensity (+${sigBonus.toFixed(1)})` : null,
          recency   ? `recency (+${recency})` : null,
        ].filter(Boolean).join(' · '),
        signal_sources: [{ type: 'detected_change', id: change.id }],
        status: 'open' as const,
        expires_at: expiresAt,
        metadata: {
          source_change_id:  change.id,
          source_competitor: competitor?.name ?? null,
          change_type:       change.change_type,
          campaign_score:    campaignSig,
          is_coordinated:    meta.is_coordinated ?? false,
        },
      }
    })

    // ── Plain insert — we already filtered out signal_ids that have an
    //    existing opportunity. The partial unique index is a safety net for
    //    rare races; swallow its unique-violation (Postgres code 23505).
    const { data: inserted, error: insertErr } = await admin
      .from('opportunities')
      .insert(rows)
      .select('id, opportunity_score, title')

    if (insertErr && insertErr.code !== '23505') {
      return json({ error: 'Insert failed', detail: insertErr.message, code: insertErr.code }, 500)
    }

    return json({
      scored:     inserted?.length ?? 0,
      considered: changes.length,
      skipped:    changes.length - todo.length,
      top: (inserted ?? [])
        .sort((a, b) => (b.opportunity_score as number) - (a.opportunity_score as number))
        .slice(0, 5)
        .map((o) => ({ id: o.id, score: o.opportunity_score, title: (o.title as string)?.slice(0, 60) })),
    })
  } catch (err) {
    console.error('score-opportunities error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
