/**
 * score-opportunities — MVP 2.0 AI Opportunity Radar
 *
 * Aligned with the MVP 2.0 Delivery Plan (Ankit Jha, May 2026):
 *   • §6 AI Decision Engine — "embeddings + vector similarity + heuristic
 *     scoring + LLM enrichment"
 *   • §13 Risk Mitigation — "AI hallucinated insights → Deterministic
 *     scoring remains primary" (so the SCORE is heuristic, never LLM-ranked)
 *   • §18 — "compounding intelligence system powered by signals, embeddings,
 *     campaign outcomes" (vector-boost from past campaign outcomes)
 *
 * Pipeline per opportunity:
 *   1. DEDUP by (user_id, competitor_id, day)
 *   2. HEURISTIC SCORE (deterministic, primary) — 0..100
 *   3. VECTOR BOOST  — query campaign_embeddings for past similar campaigns
 *      this user already ran; nudge score by their real outcomes
 *   4. LLM ENRICHMENT (Gemini) — punchy title + recommended_action, with
 *      heuristic fallback so the cron never breaks
 *   5. Insert into `opportunities`, idempotent on metadata.source_change_id
 *
 * POST {}                          — score every user's recent signals
 * POST { user_id }                 — only one user
 * POST { window_hours }            — override 48h lookback (1..8760)
 * POST { skip_llm: true }          — skip Gemini enrichment (e.g. local tests)
 * POST { skip_vector_boost: true } — skip pgvector lookup
 *
 * verify_jwt is OFF — invoked by pg_cron and internal scripts only.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { baselineFor } from '../_shared/heuristic-forecast.ts'

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

// Industry CPC + conversion baselines now live in _shared/heuristic-forecast.ts
// (imported above as `baselineFor`) — this cron used to keep its own copy of
// the table, which is exactly the kind of drift that motivated centralizing it.
//
// This cron intentionally stays heuristic-only rather than calling the live
// Google/Meta forecast APIs (see _shared/forecast-engine.ts, used by
// predict-budget / forecast-campaign): it scores potentially hundreds of
// opportunities across many users on an hourly schedule, and a per-opportunity
// live API call would multiply out to a lot of latency + rate-limit exposure
// across users' ad accounts for numbers that are just feed-ranking signals,
// not a number the user is about to spend against. The live forecast only
// runs synchronously, once, when a user actually opens a specific opportunity
// to launch a campaign (CampaignModal → forecast-campaign) — that's the
// moment the accuracy actually matters and the cost of one API call is
// trivial. The feed is labeled a "benchmark estimate" in the UI accordingly.

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

// ── CPC prediction text ──────────────────────────────────────────────────────
// Forward-looking sentence shown on opportunity cards — one of the key
// differentiators the MVP 2 doc calls out vs competitor tools.
function cpcPrediction(
  score: number,
  hasSearchSpike: boolean,
  hasAdVolume: boolean,
  activityCount: number,
): string {
  const multiSignal = (hasSearchSpike ? 1 : 0) + (hasAdVolume ? 1 : 0) + (activityCount >= 3 ? 1 : 0)

  if (score >= 75) {
    if (hasAdVolume && activityCount >= 3)
      return `Competitor spend surging + ${activityCount} moves this week — CPCs rising NOW. Window closing fast.`
    if (hasSearchSpike && hasAdVolume)
      return `Demand spike + ad volume surge detected — CPCs will rise within 24–48 hours.`
    if (hasSearchSpike)
      return `Search demand surging — CPCs likely to rise within 3–5 days as advertisers respond.`
    return `High-urgency signal — act within 48 hours before CPCs escalate.`
  }
  if (score >= 50) {
    if (multiSignal >= 2)
      return `Multiple signals agree — CPCs likely rising this week. Launch within 3–5 days.`
    return `Moderate opportunity — CPCs stable for now but trending up. Launch this week.`
  }
  return `Watch this space — CPCs stable. Consider launching if more signals emerge.`
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

// ── Gemini helpers (LLM enrichment per §6) ──────────────────────────────────
//
// Two narrow uses of Gemini, both per the doc:
//  1. Build a 768-dim embedding of the signal text → fed into the existing
//     match_campaign_embeddings RPC to find similar past campaigns.
//  2. Generate a punchy title + recommended_action from the signal context.
//     Falls back to the deterministic `sharperTitle()` on any error so the
//     cron never breaks (the doc explicitly notes deterministic remains primary).

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''

async function geminiEmbed(text: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY || !text) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: text.slice(0, 8000) }] },
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: 768,
        }),
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (!res.ok) return null
    const data = await res.json() as { embedding?: { values?: number[] } }
    return data.embedding?.values ?? null
  } catch {
    return null  // never break the cron
  }
}

interface EnrichResult { title: string; recommended_action: string }

// Model fallback chain — matches generate-campaign so we're guaranteed
// at least one works on this Gemini key.
const TITLE_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite']

// Strip ```json ... ``` fences and any leading prose. Gemini sometimes
// wraps the JSON despite responseMimeType=application/json.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) return fenced[1].trim()
  const brace = text.indexOf('{')
  if (brace >= 0) {
    const end = text.lastIndexOf('}')
    if (end > brace) return text.slice(brace, end + 1)
  }
  return text.trim()
}

async function geminiEnrichTitle(ctx: {
  competitorName: string
  industry: string | null
  changeType: string
  severity: string
  pageType: string | null
  promoCodes: string[]
  priceBefore: string[]
  priceAfter: string[]
  addedContent: string[]
  isCoordinated: boolean
  score: number
  siblingTypes: string[]
}): Promise<EnrichResult | null> {
  if (!GEMINI_API_KEY) return null

  // Combined instruction + signal context as one user message (no systemInstruction —
  // it fails on some free-tier configs). JSON-only output, no markdown.
  const prompt = `You are an SMB ad-marketing copywriter writing OPPORTUNITY ALERT titles for a competitive-intelligence dashboard.

Generate a punchy alert for this competitor signal:
- Competitor: ${ctx.competitorName}
${ctx.industry ? `- Industry: ${ctx.industry}\n` : ''}- Change type: ${ctx.changeType}
- Severity: ${ctx.severity}
${ctx.pageType ? `- Page type: ${ctx.pageType}\n` : ''}${ctx.promoCodes.length ? `- Promo codes: ${ctx.promoCodes.slice(0, 3).join(', ')}\n` : ''}${ctx.priceBefore.length && ctx.priceAfter.length ? `- Price moved ${ctx.priceBefore[0]} → ${ctx.priceAfter[0]}\n` : ''}${ctx.addedContent.length ? `- Added content snippets: ${ctx.addedContent.slice(0, 3).map(s => s.slice(0, 80)).join(' | ')}\n` : ''}${ctx.isCoordinated ? `- COORDINATED multi-page launch detected\n` : ''}${ctx.siblingTypes.length ? `- Same-day sibling changes: ${ctx.siblingTypes.join(', ')}\n` : ''}- Opportunity score: ${ctx.score}/100

Return ONLY a JSON object (no markdown fences, no prose), shape:
{"title": "<≤90 chars, punchy, name competitor, what changed + why it matters. No emojis, no 'AI', no 'alert:' prefix>", "recommended_action": "<≤130 chars, one concrete next step the user can act on TODAY, active voice>"}`

  for (const model of TITLE_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 220,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(8_000),
        },
      )
      if (res.status === 429 || res.status === 404) continue  // try next model
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.warn(`geminiEnrichTitle ${model} HTTP ${res.status}: ${body.slice(0, 150)}`)
        continue
      }
      const data = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        console.warn(`geminiEnrichTitle ${model} empty response, finishReason=${data.candidates?.[0]?.finishReason}`)
        continue
      }
      const parsed = JSON.parse(extractJson(text)) as Partial<EnrichResult>
      if (typeof parsed.title !== 'string' || typeof parsed.recommended_action !== 'string') {
        console.warn(`geminiEnrichTitle ${model} bad shape: ${text.slice(0, 150)}`)
        continue
      }
      // Reject unfilled template placeholders like "[specific user segment]" —
      // seen in the wild; the deterministic fallback title is better than a
      // customer-facing bracket artifact.
      if (/[\[\]{}]/.test(parsed.title) || /[\[\]{}]/.test(parsed.recommended_action)) {
        console.warn(`geminiEnrichTitle ${model} placeholder artifact: ${parsed.title.slice(0, 100)}`)
        continue
      }
      return {
        title:              parsed.title.slice(0, 120),
        recommended_action: parsed.recommended_action.slice(0, 160),
      }
    } catch (err) {
      console.warn(`geminiEnrichTitle ${model} threw:`, String(err).slice(0, 200))
    }
  }
  return null  // all models failed → caller uses deterministic fallback
}

// ── Vector boost from past campaign outcomes (§18 compounding intelligence) ─
//
// Query campaign_embeddings (via match_campaign_embeddings RPC) for past
// campaigns this user already ran that are semantically similar to the
// current signal. If they performed well → +5 score, +0.05 confidence.
// If they performed poorly → -3 score (this archetype doesn't convert here).
interface VectorBoost { scoreDelta: number; confidenceDelta: number; reason: string | null }

async function vectorBoostFor(
  admin: ReturnType<typeof createClient>,
  userId: string,
  signalText: string,
): Promise<VectorBoost> {
  const NEUTRAL: VectorBoost = { scoreDelta: 0, confidenceDelta: 0, reason: null }
  const embedding = await geminiEmbed(signalText)
  if (!embedding) return NEUTRAL

  const { data, error } = await admin.rpc('match_campaign_embeddings', {
    query_embedding:  embedding,
    match_user_id:    userId,
    match_threshold:  0.7,
    match_count:      3,
  })
  if (error || !Array.isArray(data) || data.length === 0) return NEUTRAL

  const top = data[0] as {
    similarity: number
    outcome_leads:       number | null
    outcome_conversions: number | null
    outcome_spend:       number | null
  }
  const leads = Number(top.outcome_leads ?? 0)
  const sim   = Number(top.similarity   ?? 0)

  // Past similar campaign converted well → boost the new opportunity
  if (leads >= 5 && sim >= 0.75) {
    return {
      scoreDelta:      Math.min(8, Math.round(sim * 10)),
      confidenceDelta: 0.07,
      reason:          `past_similar_won (${leads} leads, sim=${sim.toFixed(2)})`,
    }
  }
  // Past similar campaign flopped → temper the new opportunity
  if (leads === 0 && Number(top.outcome_spend ?? 0) > 50 && sim >= 0.78) {
    return {
      scoreDelta:      -3,
      confidenceDelta: 0.02,
      reason:          `past_similar_flopped (sim=${sim.toFixed(2)})`,
    }
  }
  // Match exists but neutral → just add a small confidence nudge
  return {
    scoreDelta:      0,
    confidenceDelta: 0.03,
    reason:          `past_similar_seen (sim=${sim.toFixed(2)})`,
  }
}

// Compact text representation of a signal used as the vector query
function signalText(
  competitorName: string | null,
  industry: string | null,
  changeType: string,
  meta: Record<string, unknown>,
  pageType: string | null,
): string {
  const codes      = Array.isArray(meta.promo_codes)    ? (meta.promo_codes    as string[]).slice(0, 5).join(', ') : ''
  const added      = Array.isArray(meta.added_content)  ? (meta.added_content  as string[]).slice(0, 5).join(' | ') : ''
  const priceAfter = Array.isArray(meta.price_after)    ? (meta.price_after    as string[]).slice(0, 3).join(', ') : ''
  return [
    industry        ? `Industry: ${industry}` : null,
    competitorName  ? `Competitor: ${competitorName}` : null,
    `Change: ${changeType}`,
    pageType        ? `Page: ${pageType}` : null,
    codes           ? `Promo codes: ${codes}` : null,
    priceAfter      ? `New prices: ${priceAfter}` : null,
    added           ? `Added: ${added}` : null,
  ].filter(Boolean).join('\n')
}

// ── Cross-source signal boost (MVP 2.0 Phase 1 Signal Engine) ───────────────
//
// For each detected_change-based opportunity, look up other signals from the
// `signals` table that corroborate the same opportunity:
//   • AD_VOLUME_SPIKE   from same competitor   (+6 score, +0.10 confidence)
//   • NEW_CREATIVE      from same competitor   (+4 score, +0.05 confidence)
//   • OFFER_REPEAT      from same competitor   (+5 score, +0.07 confidence)
//   • SEARCH_SPIKE      matching industry      (+5 score, +0.07 confidence)
//   • RISING_KEYWORD    matching industry      (+2 score, +0.03 confidence)
//
// Per the MVP 2.0 doc: an opportunity becomes HIGH when MULTIPLE signal
// sources agree — e.g. competitor changed home page + ad volume spiked +
// search demand rising = "launch now" signal.

interface CrossSourceBoost {
  scoreDelta:       number
  confidenceDelta:  number
  reasons:          string[]
  signalIds:        string[]
  signalTypes:      string[]
}

async function crossSourceBoostFor(
  admin: ReturnType<typeof createClient>,
  userId: string,
  competitorId: string | null,
  industry: string | null,
): Promise<CrossSourceBoost> {
  const NEUTRAL: CrossSourceBoost = { scoreDelta: 0, confidenceDelta: 0, reasons: [], signalIds: [], signalTypes: [] }
  if (!competitorId && !industry) return NEUTRAL

  // Pull signals from the last 48h that touch the same competitor OR industry
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  let q = admin
    .from('signals')
    .select('id, signal_type, source, industry, growth_pct, competitor_id, payload')
    .eq('user_id', userId)
    .gte('collected_at', since)
    .limit(50)

  // Filter by either competitor OR industry — supabase `.or()` keeps it
  const orParts: string[] = []
  if (competitorId) orParts.push(`competitor_id.eq.${competitorId}`)
  if (industry)     orParts.push(`industry.eq.${industry.toLowerCase().trim()}`)
  if (orParts.length > 0) q = q.or(orParts.join(','))

  const { data: signals, error } = await q
  if (error || !signals || signals.length === 0) return NEUTRAL

  let scoreDelta      = 0
  let confidenceDelta = 0
  const reasons:     string[] = []
  const signalIds:   string[] = []
  const signalTypes: string[] = []

  const WEIGHTS: Record<string, { score: number; conf: number }> = {
    AD_VOLUME_SPIKE: { score: 6, conf: 0.10 },
    NEW_CREATIVE:    { score: 4, conf: 0.05 },
    OFFER_REPEAT:    { score: 5, conf: 0.07 },
    SEARCH_SPIKE:    { score: 5, conf: 0.07 },
    RISING_KEYWORD:  { score: 2, conf: 0.03 },
  }

  for (const s of signals) {
    const w = WEIGHTS[s.signal_type as string]
    if (!w) continue
    scoreDelta      += w.score
    confidenceDelta += w.conf
    signalIds.push(s.id as string)
    signalTypes.push(s.signal_type as string)
    const growth = s.growth_pct != null ? ` (+${s.growth_pct}%)` : ''
    reasons.push(`${(s.signal_type as string).toLowerCase()}${growth}`)
  }

  // Cap deltas so cross-source can't single-handedly dominate the score
  scoreDelta      = Math.min(20, scoreDelta)
  confidenceDelta = Math.min(0.25, confidenceDelta)
  return { scoreDelta, confidenceDelta, reasons, signalIds, signalTypes }
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
    const onlyUser         = (reqBody as { user_id?: string }).user_id ?? null
    const windowHours      = Math.min(8760, Math.max(1, Number((reqBody as { window_hours?: number }).window_hours) || 48))
    const skipLlm          = (reqBody as { skip_llm?: boolean }).skip_llm === true
    const skipVectorBoost  = (reqBody as { skip_vector_boost?: boolean }).skip_vector_boost === true
    // Only enrich opportunities above this heuristic score — keep Gemini cost low
    const enrichThreshold  = 50

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

    // ── Pre-compute 7-day competitor activity counts per (user_id, industry) ──
    // Stored in opportunity metadata so the card can show "3 moves this week"
    // without a separate query in the frontend.
    const activitySince = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data: activityRows } = await admin
      .from('detected_changes')
      .select('user_id, competitor_id, competitors(industry)')
      .gte('detected_at', activitySince)

    // Build: userId → industry (lowercase) → count
    const activityMap = new Map<string, number>()
    for (const row of activityRows ?? []) {
      const industry = ((row.competitors as { industry: string | null } | null)?.industry ?? '').toLowerCase().trim()
      const key = `${row.user_id as string}|${industry}`
      activityMap.set(key, (activityMap.get(key) ?? 0) + 1)
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
    const rows: Record<string, unknown>[] = []
    for (const { primary: change, siblings } of todo) {
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

      const heuristicScore = Math.min(100, Math.max(0,
        sevScore + typeScore + coordBonus + sigBonus + recency
        + pageWeight + promoBonus + priceBonus + siblingBonus + jitter,
      ))

      // VECTOR BOOST (§18 compounding intelligence) — only for opps that
      // already cleared the enrichment threshold, to keep Gemini calls cheap.
      let vectorReason: string | null = null
      let vectorScoreDelta              = 0
      let vectorConfidenceDelta         = 0
      if (!skipVectorBoost && heuristicScore >= enrichThreshold) {
        const sig = signalText(competitor?.name ?? null, industry, change.change_type as string, meta, page?.page_type ?? null)
        const vb  = await vectorBoostFor(admin, change.user_id as string, sig)
        vectorReason          = vb.reason
        vectorScoreDelta      = vb.scoreDelta
        vectorConfidenceDelta = vb.confidenceDelta
      }

      // CROSS-SOURCE BOOST (MVP 2.0 Phase 1 Signal Engine) — aggregate any
      // Google Trends / Meta Ad Library signals from the `signals` table that
      // touch the same competitor or industry. Always runs (cheap query, no
      // LLM cost) — the multi-source corroboration is the doc's core thesis.
      const cs = await crossSourceBoostFor(
        admin,
        change.user_id  as string,
        change.competitor_id as string | null,
        industry,
      )

      const score = Math.min(100, Math.max(0,
        heuristicScore + vectorScoreDelta + cs.scoreDelta,
      ))

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
      confidence = Math.min(0.95, confidence + vectorConfidenceDelta + cs.confidenceDelta)

      // ── LLM-enriched title + recommended_action (§6) ────────────────
      // Only call Gemini for opps above the enrichment threshold; fall back
      // to deterministic sharperTitle() / suggestAction() on any error so
      // the cron never breaks (§13 — deterministic remains primary).
      const fallbackTitle  = sharperTitle(change.title as string | null, change.change_type as string, competitor?.name ?? null, meta)
      const fallbackAction = suggestAction(change.change_type as string, score)
      let finalTitle  = fallbackTitle
      let finalAction = fallbackAction
      let llmUsed     = false
      if (!skipLlm && score >= enrichThreshold) {
        const enrich = await geminiEnrichTitle({
          competitorName: competitor?.name ?? 'Competitor',
          industry,
          changeType:   change.change_type as string,
          severity:     change.severity as string,
          pageType:     page?.page_type ?? null,
          promoCodes:   Array.isArray(meta.promo_codes)   ? (meta.promo_codes   as string[]) : [],
          priceBefore:  Array.isArray(meta.price_before)  ? (meta.price_before  as string[]) : [],
          priceAfter:   Array.isArray(meta.price_after)   ? (meta.price_after   as string[]) : [],
          addedContent: Array.isArray(meta.added_content) ? (meta.added_content as string[]) : [],
          isCoordinated: meta.is_coordinated === true,
          score,
          siblingTypes:  siblings.map((s) => s.change_type as string),
        })
        if (enrich) {
          finalTitle  = enrich.title
          finalAction = enrich.recommended_action
          llmUsed     = true
        }
      }
      const titleWithSiblings = siblings.length > 0
        ? `${finalTitle} · +${siblings.length} more today`
        : finalTitle

      // Customer-readable score explanation (Priority 5 — shown in the UI
      // instead of the technical breakdown below, which stays for debugging)
      const changeTypeLabels: Record<string, string> = {
        promotion:        'Promotion detected on competitor site',
        price_change:     'Competitor price change detected',
        campaign_launch:  'New competitor campaign launched',
        new_landing_page: 'New competitor landing page published',
        new_blog_post:    'New competitor blog post published',
        banner_change:    'Competitor homepage banner updated',
        content_change:   'Competitor website content updated',
      }
      const scoreReasons = [
        changeTypeLabels[change.change_type as string] ?? 'Competitor website change detected',
        change.severity === 'high' ? 'High-impact, customer-facing change' : null,
        meta.is_coordinated === true ? 'Coordinated changes across multiple pages' : null,
        siblings.length > 0 ? `${siblings.length + 1} changes from this competitor today` : null,
        promoCodes > 0 ? `Promo code${promoCodes > 1 ? 's' : ''} found on the page` : null,
        priceAfter > 0 ? 'Price points changed' : null,
        cs.signalTypes.includes('SEARCH_SPIKE')    ? 'Search demand increased in your market' : null,
        cs.signalTypes.includes('AD_VOLUME_SPIKE') ? 'Competitor ad activity increased' : null,
        cs.signalTypes.includes('NEW_CREATIVE')    ? 'New competitor ad creative detected' : null,
        cs.signalTypes.includes('OFFER_REPEAT')    ? 'Competitor is repeating a proven offer' : null,
        vectorReason?.startsWith('past_similar_won')     ? 'A similar past campaign of yours performed well' : null,
        vectorReason?.startsWith('past_similar_flopped') ? 'Note: a similar past campaign underperformed' : null,
      ].filter(Boolean) as string[]

      // 7-day competitor activity count for this (user, industry) pair
      const industryKey = `${change.user_id as string}|${(industry ?? '').toLowerCase().trim()}`
      const competitorActivity7d = activityMap.get(industryKey) ?? 0

      // CPC prediction — uses cross-source signal types for context
      const hasSearchSpike = cs.signalTypes.includes('SEARCH_SPIKE')
      const hasAdVolume    = cs.signalTypes.includes('AD_VOLUME_SPIKE')
      const cpcPred = cpcPrediction(score, hasSearchSpike, hasAdVolume, competitorActivity7d)

      rows.push({
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
        recommended_action: finalAction,
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
          vectorReason  ? `${vectorReason} (${vectorScoreDelta >= 0 ? '+' : ''}${vectorScoreDelta})` : null,
          cs.scoreDelta ? `cross-source[${cs.reasons.join(', ')}] (+${cs.scoreDelta})` : null,
          llmUsed       ? `llm_enriched` : null,
        ].filter(Boolean).join(' · '),
        signal_sources: [
          { type: 'detected_change', id: change.id },
          ...siblings.map((s) => ({ type: 'detected_change' as const, id: s.id, change_type: s.change_type })),
          ...cs.signalIds.map((id, i) => ({ type: 'signal' as const, id, signal_type: cs.signalTypes[i] })),
        ],
        status: 'open' as const,
        expires_at: expiresAt,
        metadata: {
          score_reasons:       scoreReasons,
          source_change_id:    change.id,
          source_competitor:   competitor?.name ?? null,
          change_type:         change.change_type,
          campaign_score:      campaignSig,
          is_coordinated:      meta.is_coordinated ?? false,
          sibling_change_ids:  siblings.map((s) => s.id),
          sibling_types:       siblings.map((s) => s.change_type),
          heuristic_score:        heuristicScore,
          vector_score_delta:     vectorScoreDelta,
          vector_reason:          vectorReason,
          cross_source_delta:     cs.scoreDelta,
          cross_source_reasons:   cs.reasons,
          cross_source_signal_ids: cs.signalIds,
          cross_source_signal_types: cs.signalTypes,
          llm_enriched:               llmUsed,
          competitor_activity_7d:     competitorActivity7d,
          cpc_prediction:             cpcPred,
        },
      })
    }

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

    // ── Phase 2: Standalone signal-driven opportunities ──────────────────
    //
    // The doc's core vision: "AI predicts market movement BEFORE competitors
    // dominate." This phase generates opportunities directly from Google Trends
    // SEARCH_SPIKE and Meta AD_VOLUME_SPIKE signals — no competitor change
    // required. If searches for "luxury apartments" jump 40% this week, an
    // opportunity appears even if we haven't detected a competitor move yet.
    //
    // Only processes signals from the last 24 h with growth_pct >= 25.
    // Deduped via signal_id column — one opportunity per signal, idempotent.

    let sigInserted = 0
    try {
      const sigSince = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      let sigQ = admin
        .from('signals')
        .select('id, user_id, signal_type, source, industry, location, keyword, competitor_id, payload, growth_pct, weight, collected_at')
        .in('signal_type', ['SEARCH_SPIKE', 'AD_VOLUME_SPIKE'])
        .gte('collected_at', sigSince)
        .gte('growth_pct', 25)
        .order('growth_pct', { ascending: false })
        .limit(100)

      if (onlyUser) sigQ = sigQ.eq('user_id', onlyUser)
      const { data: freshSignals } = await sigQ

      if (freshSignals && freshSignals.length > 0) {
        const freshIds = freshSignals.map((s) => s.id as string)

        // Skip signals that already have an opportunity
        const { data: existingOps } = await admin
          .from('opportunities')
          .select('signal_id')
          .in('signal_id', freshIds)

        const usedSigIds = new Set((existingOps ?? []).map((o) => o.signal_id as string))
        const toScore = freshSignals.filter((s) => !usedSigIds.has(s.id as string))

        const sigRows: Record<string, unknown>[] = []

        for (const sig of toScore) {
          const growth   = Number(sig.growth_pct ?? 25)
          const industry = sig.industry as string | null
          const location = sig.location as string | null
          const keyword  = sig.keyword  as string | null
          const isTrend  = (sig.signal_type as string) === 'SEARCH_SPIKE'
          const payload  = (sig.payload as Record<string, unknown> | null) ?? {}

          // Score: base (35 trend / 40 ad-volume) + growth bonus + industry bonus
          const score = Math.min(100, Math.max(0,
            (isTrend ? 35 : 40)
            + Math.min(35, (growth / 100) * 50)
            + (industry ? 8 : 0)
            + (location ? 5 : 0),
          ))

          // Only emit opportunities above a minimum bar — low-growth signals
          // that don't reach this threshold are only useful as cross-source boost
          if (score < 35) continue

          const baseline  = baselineFor(industry)
          const oppFactor = 0.5 + (score / 100) * 0.8
          const adjCpc    = baseline.cpc * (2 - oppFactor)
          const recBudget = Math.max(10, Math.round(adjCpc * 30))
          const expLeads  = Math.max(0, Math.round(
            ((recBudget * 7) / adjCpc) * baseline.conversion_rate,
          ))
          const cpl = expLeads > 0
            ? Math.round((recBudget * 7 / expLeads) * 100) / 100
            : 0

          let confidence = 0.38
          if (industry)     confidence += 0.12
          if (location)     confidence += 0.05
          if (growth >= 40) confidence += 0.12
          if (growth >= 70) confidence += 0.10
          confidence = Math.min(0.88, confidence)

          const kw = keyword ?? industry ?? 'market demand'

          let title: string
          let action: string
          let description: string

          if (isTrend) {
            const backend = (payload.backend as string | null) ?? 'google_trends'
            const source  = backend === 'serpapi' ? 'Google Trends' : 'Trending searches'
            title       = `Search demand for "${kw}" spiking +${growth}% — act before CPCs rise`
            description = `${source} detected a ${growth}% surge in searches for "${kw}"${location ? ` in ${location}` : ''}. This window closes as competitors respond and CPCs climb.`
            action      = growth >= 50
              ? `Launch a targeted campaign NOW — demand is surging and CPCs will rise within days.`
              : `Strong search demand signal — launch within the week to get ahead of competitors.`
          } else {
            const recentCount = (payload.recent_count as number | null) ?? 0
            const baseCount   = (payload.baseline_count as number | null) ?? 0
            title       = `Competitor ad spend surging +${growth}%${industry ? ` in ${industry}` : ''} — counter before they dominate`
            description = `Meta Ad Library shows a ${growth}% spike in competitor ad volume${industry ? ` in the ${industry} space` : ''}${location ? ` (${location})` : ''}${recentCount ? ` — ${recentCount} ads active vs baseline of ${baseCount}` : ''}. They are scaling aggressively.`
            action      = `Launch a counter-campaign now while their CPCs are still manageable.`
          }

          // 7-day activity count for this industry
          const sigIndustryKey = `${sig.user_id as string}|${(industry ?? '').toLowerCase().trim()}`
          const sigActivity7d  = activityMap.get(sigIndustryKey) ?? 0
          const sigCpcPred     = cpcPrediction(
            score,
            (sig.signal_type as string) === 'SEARCH_SPIKE',
            (sig.signal_type as string) === 'AD_VOLUME_SPIKE',
            sigActivity7d,
          )

          // Try to find the most recent competitor change in the same industry
          // so the "Launch Campaign" button has a source_change_id to work with.
          // Purely opportunistic — not required for the opportunity to appear.
          let linkedChangeId: string | null = null
          if (industry) {
            const { data: recentChange } = await admin
              .from('detected_changes')
              .select('id')
              .eq('user_id', sig.user_id as string)
              .gte('detected_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
              .order('detected_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            linkedChangeId = (recentChange as { id: string } | null)?.id ?? null
          }

          sigRows.push({
            user_id:            sig.user_id,
            signal_id:          sig.id,
            title,
            description,
            industry,
            location,
            market_name:        [industry, location].filter(Boolean).join(' · ') || null,
            opportunity_score:  Math.round(score * 10) / 10,
            expected_leads:     expLeads,
            estimated_cpc:      Math.round(adjCpc * 100) / 100,
            estimated_cpl:      cpl,
            recommended_budget: recBudget,
            confidence:         Math.round(confidence * 100) / 100,
            recommended_action: action,
            reasoning:          [
              `signal=${sig.signal_type as string}`,
              `growth=+${growth}%`,
              `keyword=${kw}`,
              industry ? `industry=${industry}` : null,
              location ? `location=${location}` : null,
            ].filter(Boolean).join(' · '),
            signal_sources: [{
              type:        'signal',
              id:          sig.id,
              signal_type: sig.signal_type,
              source:      sig.source,
              growth_pct:  growth,
              keyword:     kw,
            }],
            status:    'open',
            expires_at: expiresAt,
            metadata: {
              score_reasons: [
                isTrend
                  ? `Search demand for "${kw}" increased +${growth}%`
                  : `Competitor ad volume increased +${growth}%`,
                industry ? `Matched to your industry: ${industry}` : null,
                location ? `Location: ${location}` : null,
                growth >= 50 ? 'Strong growth — window closes as competitors respond' : null,
              ].filter(Boolean),
              source_signal_id:  sig.id,
              source_change_id:  linkedChangeId,  // best-effort: linked for Launch button
              signal_type:       sig.signal_type,
              source:            sig.source,
              keyword,
              growth_pct:        growth,
              location,
              industry,
              is_standalone:          true,
              competitor_activity_7d: sigActivity7d,
              cpc_prediction:         sigCpcPred,
            },
          })
        }

        if (sigRows.length > 0) {
          const { data: sigData, error: sigErr } = await admin
            .from('opportunities')
            .insert(sigRows)
            .select('id')
          if (!sigErr) sigInserted = sigData?.length ?? 0
          // 23505 = unique violation on signal_id race — safe to ignore
        }
      }
    } catch (sigPhaseErr) {
      // Phase 2 failures are non-fatal — change-based opps still got inserted
      console.warn('signal-phase error (non-fatal):', String(sigPhaseErr).slice(0, 200))
    }

    return json({
      scored:           (inserted?.length ?? 0) + sigInserted,
      change_based:     inserted?.length ?? 0,
      signal_based:     sigInserted,
      considered:       changes.length,
      skipped:          changes.length - todo.length,
      top: [...(inserted ?? [])]
        .sort((a, b) => (b.opportunity_score as number) - (a.opportunity_score as number))
        .slice(0, 5)
        .map((o) => ({ id: o.id, score: o.opportunity_score, title: (o.title as string)?.slice(0, 60) })),
    })
  } catch (err) {
    console.error('score-opportunities error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
