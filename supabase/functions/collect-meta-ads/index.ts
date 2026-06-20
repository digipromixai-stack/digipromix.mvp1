/**
 * collect-meta-ads — MVP 2.0 §Phase 1 Signal Engine
 *
 * Polls the Meta Ad Library API (public, free) for each user's active
 * competitors. Computes ad velocity vs prior 7-day baseline and inserts:
 *   • AD_VOLUME_SPIKE  — # active ads jumped vs baseline
 *   • NEW_CREATIVE     — new ad creatives spotted today
 *   • OFFER_REPEAT     — same offer keyword repeated 3+ times (aggressive push)
 *
 * Meta Ad Library API docs:
 *   https://www.facebook.com/ads/library/api/?source=archive-landing-page
 * Requires a Meta access token — uses the existing META_APP_ACCESS_TOKEN
 * (set up for launch-meta-campaign) which is sufficient for the public
 * /ads_archive endpoint.
 *
 * POST {}             — collect for every user with active competitors
 * POST { user_id }    — only one user
 * POST { competitor_id } — only one competitor
 * POST { force: true }  — re-collect even if a recent signal exists
 *
 * verify_jwt is OFF — invoked by pg_cron or internal scripts only.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Meta Ad Library token resolution priority:
//   1. Per-user token from ad_integrations (preferred — works once the user
//      completes ID verification at https://www.facebook.com/id)
//   2. Global META_APP_ACCESS_TOKEN / META_ACCESS_TOKEN env (for testing)
//   3. App token built from META_APP_ID|META_APP_SECRET (last resort)
//
// The /ads_archive endpoint requires identity verification per Meta docs:
// https://www.facebook.com/ads/library/api/?source=archive-landing-page
// — there's no API workaround for that.
const META_APP_ID     = Deno.env.get('META_APP_ID')     ?? ''
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') ?? ''
const FALLBACK_TOKEN  = Deno.env.get('META_APP_ACCESS_TOKEN')
  ?? Deno.env.get('META_ACCESS_TOKEN')
  ?? (META_APP_ID && META_APP_SECRET ? `${META_APP_ID}|${META_APP_SECRET}` : '')

import { META_GRAPH } from '../_shared/config.ts'

// Map competitor's website_url TLD to the 2-letter Ad Library country code.
// competitors table doesn't have an explicit location column.
function adCountryFromUrl(url: string | null | undefined): string {
  if (!url) return 'US'
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.endsWith('.de'))    return 'DE'
    if (host.endsWith('.in'))    return 'IN'
    if (host.endsWith('.co.uk') || host.endsWith('.uk'))    return 'GB'
    if (host.endsWith('.fr'))    return 'FR'
    if (host.endsWith('.ae'))    return 'AE'
    if (host.endsWith('.ca'))    return 'CA'
    if (host.endsWith('.au') || host.endsWith('.com.au'))   return 'AU'
    if (host.endsWith('.jp'))    return 'JP'
    if (host.endsWith('.br'))    return 'BR'
    if (host.endsWith('.mx'))    return 'MX'
    if (host.endsWith('.es'))    return 'ES'
    if (host.endsWith('.it'))    return 'IT'
    if (host.endsWith('.nl'))    return 'NL'
    return 'US'
  } catch {
    return 'US'
  }
}

interface AdRow {
  id:                 string
  ad_creative_body?:  string
  ad_creation_time?:  string
  ad_delivery_start_time?: string
  page_name?:         string
  publisher_platforms?: string[]
}

async function fetchAds(brand: string, country: string, token: string): Promise<{ ads: AdRow[]; error?: string }> {
  if (!token) return { ads: [], error: 'no_token' }
  // ad_type=ALL is REQUIRED to get commercial ads — default is
  // POLITICAL_AND_ISSUE_ADS only, which would return empty for normal brands.
  const url = `${META_GRAPH}/ads_archive`
    + `?search_terms=${encodeURIComponent(brand)}`
    + `&ad_reached_countries=${encodeURIComponent(`["${country}"]`)}`
    + `&ad_active_status=ACTIVE`
    + `&ad_type=ALL`
    + `&fields=id,ad_creative_body,ad_creation_time,ad_delivery_start_time,page_name,publisher_platforms`
    + `&limit=50`
    + `&access_token=${encodeURIComponent(token)}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      let detail = `HTTP ${res.status}`
      try {
        const parsed = JSON.parse(errBody) as { error?: { code?: number; error_subcode?: number; message?: string } }
        if (parsed.error?.error_subcode === 2332002) detail = 'identity_verification_required'
        else if (parsed.error?.error_subcode === 2332004) detail = 'app_role_required'
        else if (parsed.error?.code === 190)             detail = 'invalid_token'
        else if (parsed.error?.message)                  detail = parsed.error.message.slice(0, 80)
      } catch { /* not JSON */ }
      console.warn(`Meta Ad Library ${brand}: ${detail}`)
      return { ads: [], error: detail }
    }
    const data = await res.json() as { data?: AdRow[] }
    return { ads: data.data ?? [] }
  } catch (err) {
    console.warn(`Meta Ad Library ${brand} threw:`, String(err).slice(0, 200))
    return { ads: [], error: 'fetch_failed' }
  }
}

// Extract offer keywords from ad copy. Used for OFFER_REPEAT detection.
function offerKeywords(text: string): string[] {
  const lc = text.toLowerCase()
  const found = new Set<string>()
  const patterns = [
    /(\d{1,3}%\s*off)/g,
    /(free\s+(shipping|trial|consultation|delivery))/g,
    /(buy\s*one\s*get\s*one|bogo)/g,
    /(limited\s+time|today\s+only|ends\s+(tonight|today))/g,
    /(save\s+(?:up\s+to\s+)?\$?\d+)/g,
    /(flat\s+\d{1,3}%)/g,
  ]
  for (const p of patterns) {
    for (const m of lc.matchAll(p)) found.add(m[1].trim())
  }
  return Array.from(found)
}

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  ) as SupabaseClient

  const body = await req.json().catch(() => ({})) as {
    user_id?: string; competitor_id?: string; force?: boolean
  }
  const onlyUser       = body.user_id ?? null
  const onlyCompetitor = body.competitor_id ?? null
  const force          = body.force === true

  // Resolve a per-user Meta token from ad_integrations. Keyed by user_id.
  const { data: integrations } = await admin
    .from('ad_integrations')
    .select('user_id, access_token, token_expires_at, is_active')
    .eq('platform', 'meta')
    .eq('is_active', true)
  const userTokens = new Map<string, string>()
  for (const i of integrations ?? []) {
    if (i.access_token && (!i.token_expires_at || new Date(i.token_expires_at as string) > new Date())) {
      userTokens.set(i.user_id as string, i.access_token as string)
    }
  }

  let q = admin.from('competitors')
    .select('id, user_id, name, industry, website_url')
    .eq('is_active', true)
  if (onlyUser)       q = q.eq('user_id', onlyUser)
  if (onlyCompetitor) q = q.eq('id', onlyCompetitor)

  const { data: competitors, error } = await q
  if (error) return json({ error: error.message }, 500)
  if (!competitors || competitors.length === 0) return json({ collected: 0, reason: 'no_competitors' })

  const inserts: Array<Record<string, unknown>> = []
  const summary: Array<{ competitor: string; ads: number; signals: number; reason?: string }> = []

  for (const c of competitors) {
    const compId   = c.id       as string
    const userId   = c.user_id  as string
    const brand    = c.name     as string
    const industry = (c.industry as string | null)?.toLowerCase().trim() ?? null
    const country  = adCountryFromUrl(c.website_url as string | null)

    // Skip if a fresh signal exists for this competitor (≤12h) and not forced
    if (!force) {
      const { data: recent } = await admin
        .from('signals')
        .select('id')
        .eq('competitor_id', compId)
        .eq('source', 'meta_ad_library')
        .gte('collected_at', new Date(Date.now() - 12 * 3600 * 1000).toISOString())
        .limit(1)
      if (recent && recent.length > 0) {
        summary.push({ competitor: brand, ads: 0, signals: 0, reason: 'cached' })
        continue
      }
    }

    const token = userTokens.get(userId) ?? FALLBACK_TOKEN
    if (!token) {
      summary.push({ competitor: brand, ads: 0, signals: 0, reason: 'no_meta_token_for_user' })
      continue
    }
    const { ads, error: fetchErr } = await fetchAds(brand, country, token)
    if (ads.length === 0) {
      summary.push({ competitor: brand, ads: 0, signals: 0, reason: fetchErr ?? 'no_public_ads' })
      continue
    }

    // Bucket ads by creation date for velocity calculation
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000
    const fourteenDaysAgo = now - 14 * 24 * 3600 * 1000
    const recentCount   = ads.filter(a => new Date(a.ad_creation_time ?? '').getTime() >= sevenDaysAgo).length
    const baselineCount = ads.filter(a => {
      const t = new Date(a.ad_creation_time ?? '').getTime()
      return t >= fourteenDaysAgo && t < sevenDaysAgo
    }).length
    const totalActive = ads.length

    // SIGNAL 1: AD_VOLUME_SPIKE
    if (baselineCount > 0 && recentCount >= baselineCount * 1.5 && recentCount >= 3) {
      const growth = Math.round(((recentCount - baselineCount) / baselineCount) * 100)
      inserts.push({
        user_id: userId, competitor_id: compId,
        signal_type: 'AD_VOLUME_SPIKE',
        source: 'meta_ad_library',
        industry, location: country,
        keyword: brand,
        payload: { recent_count: recentCount, baseline_count: baselineCount, total_active: totalActive },
        growth_pct: growth,
        weight: 1.6,
      })
    } else if (recentCount >= 5 && baselineCount === 0) {
      // First-time burst — even without baseline, this is signal
      inserts.push({
        user_id: userId, competitor_id: compId,
        signal_type: 'AD_VOLUME_SPIKE',
        source: 'meta_ad_library',
        industry, location: country,
        keyword: brand,
        payload: { recent_count: recentCount, baseline_count: 0, total_active: totalActive, first_burst: true },
        growth_pct: 100,
        weight: 1.4,
      })
    }

    // SIGNAL 2: NEW_CREATIVE — ads created in the last 24h with body text
    const last24h = ads.filter(a =>
      new Date(a.ad_creation_time ?? '').getTime() >= now - 24 * 3600 * 1000
      && (a.ad_creative_body ?? '').length > 10
    )
    if (last24h.length >= 2) {
      inserts.push({
        user_id: userId, competitor_id: compId,
        signal_type: 'NEW_CREATIVE',
        source: 'meta_ad_library',
        industry, location: country,
        keyword: brand,
        payload: {
          count: last24h.length,
          samples: last24h.slice(0, 3).map(a => ({
            id: a.id,
            creation_time: a.ad_creation_time,
            body: (a.ad_creative_body ?? '').slice(0, 200),
            platforms: a.publisher_platforms,
          })),
        },
        growth_pct: null,
        weight: 1.2,
      })
    }

    // SIGNAL 3: OFFER_REPEAT — same offer keyword appears 3+ times
    const allKeywords: string[] = []
    for (const a of ads) {
      if (a.ad_creative_body) allKeywords.push(...offerKeywords(a.ad_creative_body))
    }
    const keywordCounts = new Map<string, number>()
    for (const k of allKeywords) keywordCounts.set(k, (keywordCounts.get(k) ?? 0) + 1)
    const repeats = [...keywordCounts.entries()].filter(([_, n]) => n >= 3)
    if (repeats.length > 0) {
      inserts.push({
        user_id: userId, competitor_id: compId,
        signal_type: 'OFFER_REPEAT',
        source: 'meta_ad_library',
        industry, location: country,
        keyword: repeats[0][0],   // pick the most-repeated as the primary keyword
        payload: {
          repeats: repeats.map(([kw, n]) => ({ keyword: kw, count: n })),
          total_ads_analyzed: ads.length,
        },
        growth_pct: null,
        weight: 1.3,
      })
    }

    summary.push({
      competitor: brand, ads: ads.length,
      signals: inserts.filter(i => i.competitor_id === compId).length,
    })
  }

  if (inserts.length > 0) {
    const { error: insErr } = await admin.from('signals').insert(inserts)
    if (insErr) return json({ error: 'Insert failed', detail: insErr.message }, 500)
  }

  return json({
    collected: inserts.length,
    competitors: competitors.length,
    summary,
  })
})
