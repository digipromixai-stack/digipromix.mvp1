/**
 * collect-google-trends — MVP 2.0 §Phase 1 Signal Engine
 *
 * Polls Google Trends for each user's competitor industries × locations, then
 * inserts SEARCH_SPIKE / RISING_KEYWORD rows into `signals` so the AI
 * Opportunity Radar can aggregate cross-source.
 *
 * Two backends, tried in order:
 *   1. SerpAPI Google Trends   (preferred — best quality, needs SERPAPI_KEY)
 *   2. trends.google.com RSS   (free, region-level only, no keyword-specific)
 *
 * Cost: SerpAPI free tier = 100 searches/mo. Each user ≈ 1-5 keywords × 1 region
 * per day → comfortably under free tier for early MVP customers.
 *
 * POST {}                       — collect for every user with active competitors
 * POST { user_id }              — only one user
 * POST { force: true }          — re-collect even if a recent signal exists
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

const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY') ?? ''

// Industry → seed search-term mapping. Hand-tuned per the doc's primary
// verticals (real estate, retail, healthcare, b2b saas, restaurants).
// Locations are pulled from the user's competitors when available.
const INDUSTRY_SEEDS: Record<string, string[]> = {
  'real-estate':     ['apartments for rent', 'luxury apartments', 'homes for sale'],
  'real estate':     ['apartments for rent', 'luxury apartments', 'homes for sale'],
  'retail':          ['online shopping deals', 'discount sale today'],
  'ecommerce':       ['online shopping deals', 'discount sale today', 'buy online'],
  'e-commerce':      ['online shopping deals', 'discount sale today', 'buy online'],
  'healthcare':      ['family doctor near me', 'urgent care', 'medical appointment'],
  'medical':         ['family doctor near me', 'urgent care', 'medical appointment'],
  'dental':          ['dentist near me', 'teeth cleaning'],
  'b2b saas':        ['crm software', 'project management software'],
  'software':        ['software for small business', 'business automation tools'],
  'restaurant':      ['restaurants near me', 'food delivery'],
  'restaurants':     ['restaurants near me', 'food delivery'],
  'education':       ['online courses', 'best online classes'],
  'school':          ['online courses', 'best online classes'],
  'finance':         ['business loan', 'mortgage rates'],
  'legal':           ['lawyer near me', 'free legal consultation'],
  'automotive':      ['used cars near me', 'car deals'],
  'local services':  ['plumber near me', 'electrician near me', 'home services'],
  'plumbing':        ['plumber near me', 'emergency plumber'],
}

function seedsFor(industry: string | null | undefined): string[] {
  if (!industry) return []
  const key = industry.toLowerCase().trim()
  return INDUSTRY_SEEDS[key] ?? []
}

// ── SerpAPI Trends fetcher ──────────────────────────────────────────────────
// Returns one row per query/date pair, with growth_pct vs prior 7-day average.
interface TrendsRow {
  keyword:     string
  location:    string | null
  growth_pct:  number     // % change vs 7-day baseline
  current:     number     // current relative interest 0..100
  baseline:    number     // 7-day avg
  source_url:  string | null
}

async function fetchSerpapiTrends(
  keyword: string,
  geo: string,  // ISO country code, e.g. 'US', 'IN', 'DE'
): Promise<TrendsRow | null> {
  if (!SERPAPI_KEY) return null
  try {
    const url = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(keyword)}&geo=${encodeURIComponent(geo)}&data_type=TIMESERIES&api_key=${SERPAPI_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const data = await res.json() as {
      interest_over_time?: { timeline_data?: Array<{ values?: Array<{ extracted_value?: number }> }> }
    }
    const tl = data.interest_over_time?.timeline_data ?? []
    if (tl.length < 8) return null
    const vals = tl.map(t => Number(t.values?.[0]?.extracted_value ?? 0))
    const current  = vals[vals.length - 1]
    const baseline = vals.slice(-8, -1).reduce((s, v) => s + v, 0) / 7
    if (baseline === 0) return null
    const growth_pct = Math.round(((current - baseline) / baseline) * 100)
    return {
      keyword,
      location:   geo,
      growth_pct,
      current,
      baseline,
      source_url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&geo=${geo}`,
    }
  } catch {
    return null
  }
}

// ── Fallback: trending searches RSS (region only, no keyword query) ─────────
// Google retired `trendingsearches/daily/rss` in 2024. Current public endpoint
// is `trending/rss?geo=XX` which uses the Atom feed format with <item><title>.
// Returns the top trending searches in a country.
async function fetchDailyTrendsRss(geo: string): Promise<TrendsRow[]> {
  try {
    const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (DigiPromix-Bot/2.x)' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      console.warn(`Trends RSS HTTP ${res.status} for geo=${geo}`)
      return []
    }
    const xml = await res.text()
    // Try CDATA-wrapped titles first, fall back to plain <title>
    let titles = [...xml.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g)].map(m => m[1])
    if (titles.length === 0) {
      titles = [...xml.matchAll(/<item>[\s\S]*?<title>([^<]+)<\/title>/g)].map(m => m[1])
    }
    titles = titles.slice(0, 10)
    if (titles.length === 0) {
      console.warn(`Trends RSS returned no items for geo=${geo}, xml head=${xml.slice(0, 200)}`)
      return []
    }
    const approxes = [...xml.matchAll(/<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/g)]
      .map(m => m[1])
    return titles.map((kw, i) => ({
      keyword:    kw,
      location:   geo,
      growth_pct: 100,  // RSS doesn't give true growth; flag as "currently trending"
      current:    parseInt((approxes[i] ?? '0').replace(/[^0-9]/g, '')) || 0,
      baseline:   0,
      source_url: 'https://trends.google.com/trending',
    }))
  } catch (err) {
    console.warn('fetchDailyTrendsRss threw:', String(err).slice(0, 200))
    return []
  }
}

// Guess ISO geo code from a competitor's website_url TLD. competitors table
// doesn't have a location column yet, so the TLD is our best heuristic.
// `.de` → DE, `.co.uk` → GB, `.in` → IN, etc. Falls back to US.
function geoFromUrl(url: string | null): string {
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

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  ) as SupabaseClient

  const body = await req.json().catch(() => ({})) as { user_id?: string; force?: boolean }
  const onlyUser = body.user_id ?? null
  const force    = body.force === true

  // Pull every active competitor — one Trends fetch per (industry, geo) pair
  // per user, deduped so we don't waste SerpAPI credits.
  let q = admin.from('competitors')
    .select('id, user_id, name, industry, website_url')
    .eq('is_active', true)
  if (onlyUser) q = q.eq('user_id', onlyUser)
  const { data: competitors, error } = await q
  if (error) return json({ error: error.message }, 500)
  if (!competitors || competitors.length === 0) return json({ collected: 0, reason: 'no_competitors' })

  // Group by (user, industry, geo) to deduplicate fetches
  const grouped = new Map<string, { user_id: string; industry: string; geo: string }>()
  for (const c of competitors) {
    const industry = (c.industry as string | null)?.toLowerCase().trim()
    if (!industry) continue
    const geo = geoFromUrl(c.website_url as string | null)
    const key = `${c.user_id}|${industry}|${geo}`
    if (!grouped.has(key)) grouped.set(key, { user_id: c.user_id as string, industry, geo })
  }

  const results: Array<{ user: string; industry: string; geo: string; inserted: number; source: string }> = []
  const inserts: Array<Record<string, unknown>> = []

  for (const { user_id, industry, geo } of grouped.values()) {
    // Skip if a fresh signal already exists (≤6h) and not forced
    if (!force) {
      const { data: recent } = await admin
        .from('signals')
        .select('id')
        .eq('user_id', user_id)
        .eq('source', 'google_trends')
        .eq('industry', industry)
        .eq('location', geo)
        .gte('collected_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
        .limit(1)
      if (recent && recent.length > 0) {
        results.push({ user: user_id, industry, geo, inserted: 0, source: 'cached' })
        continue
      }
    }

    const seeds = seedsFor(industry)
    let rows: TrendsRow[] = []
    let source = 'unknown'

    // Try SerpAPI per seed keyword first
    if (SERPAPI_KEY && seeds.length > 0) {
      source = 'serpapi'
      for (const kw of seeds.slice(0, 2)) {  // cap at 2 keywords/industry to save credits
        const r = await fetchSerpapiTrends(kw, geo)
        if (r) rows.push(r)
      }
    }

    // Fallback to daily-trends RSS — only keep items that MATCH the industry
    // seeds. Without SerpAPI we can't get true keyword-level growth, so a
    // generic regional trending list is noise. Better to insert 0 signals
    // than poison the cross-source boost with random celebrity names.
    if (rows.length === 0 && seeds.length > 0) {
      source = 'rss_daily'
      const rss = await fetchDailyTrendsRss(geo)
      const seedTokens = seeds.join(' ').toLowerCase().split(/\s+/).filter(t => t.length > 3)
      rows = rss
        .filter(r => seedTokens.some(t => r.keyword.toLowerCase().includes(t)))
        .slice(0, 3)
    }

    for (const r of rows) {
      const signal_type = r.growth_pct >= 30 ? 'SEARCH_SPIKE' : 'RISING_KEYWORD'
      inserts.push({
        user_id,
        signal_type,
        source:    'google_trends',
        industry,
        location:  geo,
        keyword:   r.keyword,
        payload: {
          current_interest:  r.current,
          baseline_interest: r.baseline,
          growth_pct:        r.growth_pct,
          source_url:        r.source_url,
          backend:           source,
        },
        growth_pct: r.growth_pct,
        weight:     r.growth_pct >= 30 ? 1.5 : 1.0,
      })
    }
    results.push({ user: user_id, industry, geo, inserted: rows.length, source })
  }

  if (inserts.length > 0) {
    const { error: insErr } = await admin.from('signals').insert(inserts)
    if (insErr) return json({ error: 'Insert failed', detail: insErr.message }, 500)
  }

  return json({ collected: inserts.length, groups: results.length, results })
})
