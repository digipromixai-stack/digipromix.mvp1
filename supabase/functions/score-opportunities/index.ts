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

// ── Page-type weight (homepage / pricing page changes matter more) ──────────
const PAGE_TYPE_WEIGHT: Record<string, number> = {
  homepage:    8,
  pricing:     10,
  product:     6,
  campaign:    8,
  landing:     6,
  blog:        2,
  custom:      4,
}

// ── Sharper auto-title using metadata ───────────────────────────────────────
//
// Generic "Promotion detected on www.bigbasket.com" → something like
// "Big Basket launched promo (SAVE30) — counter now"
function sharperTitle(
  fallback: string | null,
  changeType: string,
  competitorName: string | null,
  meta: Record<string, unknown>,
): string {
  const name        = competitorName ?? 'Competitor'
  const codes       = Array.isArray(meta.promo_codes) ? meta.promo_codes as string[] : []
  const priceAfter  = Array.isArray(meta.price_after) ? meta.price_after as string[] : []
  const priceBefore = Array.isArray(meta.price_before) ? meta.price_before as string[] : []
  const detail      = typeof meta.price_change_detail === 'string' ? meta.price_change_detail : ''
  const coord       = meta.is_coordinated === true

  switch (changeType) {
    case 'promotion':
      if (codes.length > 0) return `${name} launched promo (${codes[0]}) — counter now`
      return `${name} launched a new promotion — counter now`
    case 'campaign_launch':
      return coord
        ? `${name} launched a coordinated campaign across multiple pages`
        : `${name} launched a new campaign — match the moment`
    case 'price_change':
      if (priceBefore.length && priceAfter.length) {
        return `${name} changed prices (${priceBefore[0]} → ${priceAfter[0]})`
      }
      if (priceAfter.length) return `${name} updated pricing (${priceAfter[0]})`
      if (detail)            return `${name} pricing: ${detail}`.slice(0, 80)
      return `${name} changed pricing — review your positioning`
    case 'new_landing_page':
      return `${name} shipped a new landing page — copy what works`
    case 'banner_change':
      return `${name} updated hero banner — fresh creative angle`
    case 'new_blog_post':
      return `${name} published new content — SEO opportunity`
    default:
      return fallback ?? `${name} updated their site`
  }
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
        competitor_id, monitored_page_id,
        competitors ( name, industry ),
        monitored_pages ( page_type )
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

    // ── DEDUP: collapse multiple same-day changes from same competitor ───
    // Keep the highest-severity change per (user_id, competitor_id, YYYY-MM-DD),
    // but stash all sibling change_ids + types so the opportunity can show
    // "3 signals from Big Basket today: promo + price + new landing page".
    type ChangeRow = (typeof changes)[number]
    const groups = new Map<string, { primary: ChangeRow; siblings: ChangeRow[] }>()
    const sevRank = (s: string | null) => s === 'high' ? 3 : s === 'medium' ? 2 : 1
    for (const c of changes) {
      const day = (c.detected_at as string).slice(0, 10)
      const key = `${c.user_id}|${c.competitor_id}|${day}`
      const existingGroup = groups.get(key)
      if (!existingGroup) {
        groups.set(key, { primary: c, siblings: [] })
      } else {
        // Pick the stronger signal as primary; stash the other
        if (sevRank(c.severity as string) > sevRank(existingGroup.primary.severity as string) ||
            (sevRank(c.severity as string) === sevRank(existingGroup.primary.severity as string) &&
             (CHANGE_TYPE_WEIGHT[c.change_type as string] ?? 0) > (CHANGE_TYPE_WEIGHT[existingGroup.primary.change_type as string] ?? 0))) {
          existingGroup.siblings.push(existingGroup.primary)
          existingGroup.primary = c
        } else {
          existingGroup.siblings.push(c)
        }
      }
    }

    // ── Skip groups whose primary change is already represented in opportunities
    const primaryIds = Array.from(groups.values()).map((g) => g.primary.id)
    const { data: existing } = await admin
      .from('opportunities')
      .select('metadata')
      .in('metadata->>source_change_id', primaryIds)

    const alreadyScored = new Set(
      (existing ?? [])
        .map((o) => (o.metadata as { source_change_id?: string } | null)?.source_change_id)
        .filter((id): id is string => !!id)
    )
    const todo = Array.from(groups.values()).filter((g) => !alreadyScored.has(g.primary.id))

    if (todo.length === 0) {
      return json({ scored: 0, considered: changes.length, reason: 'all_already_scored' })
    }

    // ── Score each + build the opportunity rows ──────────────────────────
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const rows = todo.map(({ primary: change, siblings }) => {
      const competitor = change.competitors as { name: string; industry: string | null } | null
      const page       = change.monitored_pages as { page_type: string | null } | null
      const industry   = competitor?.industry ?? null
      const meta       = (change.metadata as Record<string, unknown> | null) ?? {}

      // ── Score: weighted heuristic with REAL signal variance ──────────
      const sevScore     = SEVERITY_WEIGHT[change.severity as string]   ?? 10
      const typeScore    = CHANGE_TYPE_WEIGHT[change.change_type as string] ?? 5
      const coordBonus   = (meta.is_coordinated === true) ? 15 : 0
      const campaignSig  = Number(meta.campaign_score ?? 0)
      const sigBonus     = Math.min(15, Math.max(0, (campaignSig / 150) * 15))
      const recency      = recencyBonus(change.detected_at as string)

      // NEW: page-type weight (homepage / pricing changes matter more)
      const pageWeight   = PAGE_TYPE_WEIGHT[(page?.page_type ?? 'custom').toLowerCase()] ?? 4

      // NEW: signal-density bonus from real metadata
      const promoCodes   = Array.isArray(meta.promo_codes) ? (meta.promo_codes as string[]).length : 0
      const promoBonus   = Math.min(8, promoCodes * 3)          // 0..8
      const priceAfter   = Array.isArray(meta.price_after) ? (meta.price_after as string[]).length : 0
      const priceBonus   = Math.min(6, priceAfter * 2)          // 0..6

      // NEW: sibling bonus — multiple changes on same competitor same day
      const siblingBonus = Math.min(10, siblings.length * 4)

      // Tiny deterministic per-competitor jitter so identical signals from
      // different competitors don't tie perfectly. Hash-based so it's stable
      // across re-runs (no random noise).
      const jitter = ((change.competitor_id as string).charCodeAt(0) + (change.competitor_id as string).charCodeAt(8)) % 5

      const rawScore = sevScore + typeScore + coordBonus + sigBonus + recency
                     + pageWeight + promoBonus + priceBonus + siblingBonus + jitter
      const score    = Math.min(100, Math.max(0, rawScore))

      // ── Economic projection (with per-signal variance) ──────────────
      const baseline      = baselineFor(industry)
      const sevMul        = change.severity === 'high' ? 1.4 : change.severity === 'medium' ? 1.1 : 0.85
      const oppFactor     = 0.5 + (score / 100) * 0.8           // 0.5..1.3

      // Real price signal nudges the CPC estimate — if the competitor just
      // dropped prices, our CPC bid likely rises (their auction pressure ↑)
      const priceDropMul  = (priceAfter > 0 && Array.isArray(meta.price_before) && (meta.price_before as string[]).length > 0) ? 1.15 : 1.0

      const adjustedCpc   = baseline.cpc * (2 - oppFactor) * priceDropMul
      const adjustedCvr   = baseline.conversion_rate * sevMul
      const recBudget     = Math.max(10, Math.round((adjustedCpc * 30)))
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
      if (siblings.length >= 2)           confidence += 0.05
      confidence = Math.min(0.95, confidence)

      // ── Sharper auto-title ──────────────────────────────────────────
      const title = sharperTitle(change.title as string | null, change.change_type as string, competitor?.name ?? null, meta)
      const titleWithSiblings = siblings.length > 0
        ? `${title} · +${siblings.length} more signal${siblings.length > 1 ? 's' : ''} today`
        : title

      return {
        user_id:           change.user_id,
        signal_id:         null,
        title:             titleWithSiblings,
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
          `page=${page?.page_type ?? 'custom'} (+${pageWeight})`,
          coordBonus    ? `coordinated (+${coordBonus})` : null,
          sigBonus      ? `signal_intensity (+${sigBonus.toFixed(1)})` : null,
          promoBonus    ? `promo_codes×${promoCodes} (+${promoBonus})` : null,
          priceBonus    ? `prices×${priceAfter} (+${priceBonus})` : null,
          siblingBonus  ? `same-day-siblings×${siblings.length} (+${siblingBonus})` : null,
          recency       ? `recency (+${recency})` : null,
        ].filter(Boolean).join(' · '),
        signal_sources: [
          { type: 'detected_change', id: change.id },
          ...siblings.map((s) => ({ type: 'detected_change' as const, id: s.id, change_type: s.change_type })),
        ],
        status: 'open' as const,
        expires_at: expiresAt,
        metadata: {
          source_change_id:    change.id,
          source_competitor:   competitor?.name ?? null,
          change_type:         change.change_type,
          campaign_score:      campaignSig,
          is_coordinated:      meta.is_coordinated ?? false,
          sibling_change_ids:  siblings.map((s) => s.id),
          sibling_types:       siblings.map((s) => s.change_type),
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
