/**
 * Shared forecast engine — used by both predict-budget (legacy contract,
 * kept working for anything still calling it) and forecast-campaign (the
 * canonical entry point going forward). Keeping the merge/platform-call
 * logic in one place means the two edge functions can never disagree.
 *
 * Tries the connected ad platforms' own forecast endpoints first (real
 * auction data for the user's specific ad account); always falls back to
 * the static industry-CPC heuristic (heuristic-forecast.ts) if an account
 * isn't connected or the live call errors. NEVER throws — every branch
 * degrades to a usable number.
 *
 * ── What's genuinely "live platform data" vs. still heuristic ──────────────
 * Google Ads' KeywordPlanIdeaService.GenerateKeywordForecastMetrics returns
 * real forecast clicks + average CPC for the connected account's own
 * auction context — when it succeeds, predicted_cpc/predicted_leads are
 * platform-sourced (leads = platform clicks × heuristic conversion rate,
 * since this app doesn't have conversion tracking wired up per-account to
 * ask Google for a conversions forecast).
 *
 * Meta doesn't expose an equivalent "give me your CPC/lead forecast for
 * this budget" endpoint. Its Reach & Frequency prediction endpoint
 * (/reachfrequencypredictions) is scoped to reserved Reach & Frequency
 * buying — a different campaign type than the AUCTION/OUTCOME_TRAFFIC
 * campaigns this app actually launches (see launch-meta-campaign) — and
 * its response is a reach/impression curve, not a CPC or lead number, so
 * it wouldn't give us anything more usable than what we already have here.
 * Instead we call the lighter, synchronous `/reachestimate` endpoint,
 * which *does* return a real, live, account-specific addressable-audience
 * size for the requested targeting. We use that real number to nudge the
 * heuristic CPC (small addressable audience → more competitive/expensive;
 * large audience → more headroom) rather than to originate the CPC number
 * outright — so Meta alone does not flip `source` to 'platform_forecast'
 * at the top level (only Google's direct CPC/click forecast does that);
 * the Meta contribution is still recorded and labeled per-platform.
 */

import type { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GOOGLE_ADS_API, META_GRAPH, DEFAULT_COUNTRIES, DEFAULT_AGE_MIN, DEFAULT_AGE_MAX, CPC_BUDGET_RATIO, CPC_HARD_CAP_USD } from './config.ts'
import { computeHeuristicForecast, type HeuristicResult } from './heuristic-forecast.ts'

type SupabaseAdmin = ReturnType<typeof createClient>

export interface ForecastEngineInput {
  budget:            number
  days:              number
  industry:          string | null
  severity:          string | null
  opportunityScore:  number
  keywords:          string[]
  countries?:        string[]
  ageMin?:           number
  ageMax?:           number
}

export interface PlatformOutcome {
  source: 'platform_forecast' | 'not_connected' | 'error'
  detail?: string
  // Google
  clicks?: number
  impressions?: number
  avg_cpc?: number
  // Meta
  audience_size?: number
  cpc_adjustment?: number
}

export interface ForecastEngineResult extends HeuristicResult {
  source:      'platform_forecast' | 'heuristic'
  window_days: number
  daily_budget: number
  per_platform: {
    google: PlatformOutcome
    meta:   PlatformOutcome
  }
}

async function getSecret(admin: SupabaseAdmin, envName: string, vaultName: string): Promise<string | null> {
  const fromEnv = Deno.env.get(envName)
  if (fromEnv) return fromEnv
  const { data } = await admin.rpc('get_vault_secret', { secret_name: vaultName })
  return (data as string | null) ?? null
}

// ── Google Ads: KeywordPlanIdeaService.GenerateKeywordForecastMetrics ──────
//
// Field structure verified against Google's own Python client library
// examples (examples/planning/generate_forecast_metrics.py) — CampaignToForecast
// with bidding_strategy.manual_cpc_bidding_strategy.max_cpc_bid_micros,
// geo_target_constants[], language_constants[], ad_groups[].keywords[]
// {text, matchType}, and forecast_period.{start_date,end_date}; response
// carries campaignForecastMetrics.{clicks, impressions, averageCpcMicros}.
//
// The REST URL below (`customers/{id}:generateKeywordForecastMetrics`)
// follows Google's documented custom-method transcoding convention — the
// same "resource:customMethod" shape already used elsewhere in this repo
// for Google Ads custom RPCs (see google-ads-oauth's `googleAds:searchStream`
// and launch-google-ads-campaign's `:mutate` calls). We were not able to
// render Google's live REST reference page for this specific method during
// development (it repeatedly returned 404/nav-only through automated
// fetching), so this exact path has NOT been hit against a real account.
// TODO(human): smoke-test this call against a real connected Google Ads
// account before relying on it in production; if the path or field casing
// is off, this will simply error and the existing heuristic fallback below
// keeps the feature working either way.
const GOOGLE_FORECAST_LANGUAGE_CONSTANT = 'languageConstants/1000' // English

// Partial ISO-3166 alpha-2 → Google geoTargetConstant map for common markets.
// Unmapped countries fall back to US (2840) for forecasting purposes only —
// this never affects real campaign targeting, only the forecast estimate.
// A complete mapping would call GeoTargetConstantService.SuggestGeoTargetConstants.
const GEO_TARGET_CONSTANTS: Record<string, string> = {
  US: 'geoTargetConstants/2840', GB: 'geoTargetConstants/2826', CA: 'geoTargetConstants/2124',
  AU: 'geoTargetConstants/2036', IN: 'geoTargetConstants/2356', DE: 'geoTargetConstants/2276',
  FR: 'geoTargetConstants/2250', ES: 'geoTargetConstants/2724', IT: 'geoTargetConstants/2380',
  NL: 'geoTargetConstants/2528', BR: 'geoTargetConstants/2076', MX: 'geoTargetConstants/2484',
  SG: 'geoTargetConstants/2702', AE: 'geoTargetConstants/2784', ZA: 'geoTargetConstants/2710',
  NZ: 'geoTargetConstants/2554', IE: 'geoTargetConstants/2372', PH: 'geoTargetConstants/2608',
  ID: 'geoTargetConstants/2360', NG: 'geoTargetConstants/2566', JP: 'geoTargetConstants/2392',
}

function geoTargetsFor(countries: string[]): string[] {
  const mapped = countries.map(c => GEO_TARGET_CONSTANTS[c.toUpperCase()]).filter((v): v is string => !!v)
  return mapped.length > 0 ? mapped : [GEO_TARGET_CONSTANTS.US]
}

async function refreshGoogleAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(8000),
  })
  return res.json() as Promise<{ access_token?: string; expires_in?: number; error?: string }>
}

async function callGoogleForecast(
  admin: SupabaseAdmin,
  integration: Record<string, unknown>,
  input: ForecastEngineInput,
): Promise<PlatformOutcome> {
  try {
    const clientId     = await getSecret(admin, 'GOOGLE_ADS_CLIENT_ID', 'google_ads_client_id')
    const clientSecret = await getSecret(admin, 'GOOGLE_ADS_CLIENT_SECRET', 'google_ads_client_secret')
    const devToken      = await getSecret(admin, 'GOOGLE_ADS_DEVELOPER_TOKEN', 'google_ads_developer_token')
    if (!clientId || !clientSecret || !devToken) {
      return { source: 'error', detail: 'Google Ads API credentials not configured' }
    }

    const refreshToken = integration.refresh_token as string | null
    let accessToken = integration.access_token as string
    if (refreshToken) {
      const refreshed = await refreshGoogleAccessToken(refreshToken, clientId, clientSecret)
      if (refreshed.error || !refreshed.access_token) {
        return { source: 'error', detail: refreshed.error ?? 'token refresh failed' }
      }
      accessToken = refreshed.access_token
    }

    const customerId = (integration.account_id as string).replace(/-/g, '')
    const rawLoginId  = (integration.login_customer_id as string | null)?.replace(/-/g, '') ?? null
    const loginCustomerId = rawLoginId && rawLoginId !== customerId ? rawLoginId : null

    const keywords = (input.keywords ?? []).filter(k => k && k.trim()).slice(0, 20)
    if (keywords.length === 0) return { source: 'error', detail: 'no keywords to forecast' }

    const maxCpcMicros = String(Math.round(Math.min(input.budget * CPC_BUDGET_RATIO, CPC_HARD_CAP_USD) * 1_000_000))
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const end   = new Date(start.getTime() + Math.max(1, input.days) * 24 * 60 * 60 * 1000)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    const body = {
      campaign: {
        biddingStrategy: { manualCpcBiddingStrategy: { maxCpcBidMicros: maxCpcMicros } },
        geoTargetConstants: geoTargetsFor(input.countries ?? DEFAULT_COUNTRIES),
        languageConstants: [GOOGLE_FORECAST_LANGUAGE_CONSTANT],
        adGroups: [{
          keywords: keywords.map(text => ({ text, matchType: 'BROAD' })),
        }],
      },
      forecastPeriod: { startDate: fmt(start), endDate: fmt(end) },
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    }
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

    const res = await fetch(`${GOOGLE_ADS_API}/customers/${customerId}:generateKeywordForecastMetrics`, {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (data?.error?.message as string | undefined) ?? `HTTP ${res.status}`
      return { source: 'error', detail: msg }
    }

    const metrics = data?.campaignForecastMetrics ?? data?.campaign_forecast_metrics
    const clicks      = Number(metrics?.clicks)
    const impressions = Number(metrics?.impressions)
    const avgCpcMicros = Number(metrics?.averageCpcMicros ?? metrics?.average_cpc_micros)
    if (!Number.isFinite(clicks) || clicks <= 0 || !Number.isFinite(avgCpcMicros) || avgCpcMicros <= 0) {
      return { source: 'error', detail: 'forecast returned no usable metrics' }
    }

    return {
      source: 'platform_forecast',
      clicks,
      impressions: Number.isFinite(impressions) ? impressions : undefined,
      avg_cpc: Math.round((avgCpcMicros / 1_000_000) * 100) / 100,
    }
  } catch (err) {
    return { source: 'error', detail: String(err) }
  }
}

// ── Meta: /reachestimate — live addressable-audience size for the actual
// connected ad account + targeting. See module comment above for why we use
// this instead of /reachfrequencypredictions.
function audienceDensityMultiplier(audienceSize: number): number {
  if (audienceSize < 50_000)    return 1.15  // small pool → more competitive/expensive
  if (audienceSize > 2_000_000) return 0.90  // large pool → more delivery headroom
  return 1.0
}

async function callMetaForecast(
  integration: Record<string, unknown>,
  input: ForecastEngineInput,
): Promise<PlatformOutcome> {
  try {
    const token     = integration.access_token as string
    const accountId = integration.account_id as string
    const targetingSpec = JSON.stringify({
      geo_locations: { countries: input.countries ?? DEFAULT_COUNTRIES },
      age_min: input.ageMin ?? DEFAULT_AGE_MIN,
      age_max: input.ageMax ?? DEFAULT_AGE_MAX,
    })
    const url = `${META_GRAPH}/${accountId}/reachestimate?targeting_spec=${encodeURIComponent(targetingSpec)}&optimize_for=IMPRESSIONS`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.error) {
      return { source: 'error', detail: (data?.error?.message as string | undefined) ?? `HTTP ${res.status}` }
    }
    const users = Number(data?.users)
    if (!Number.isFinite(users) || users <= 0) {
      return { source: 'error', detail: 'no audience estimate returned' }
    }
    return { source: 'platform_forecast', audience_size: users, cpc_adjustment: audienceDensityMultiplier(users) }
  } catch (err) {
    return { source: 'error', detail: String(err) }
  }
}

/**
 * Runs the full forecast: heuristic baseline, then overlays whichever live
 * platform data is available for this user. Never throws.
 */
export async function runForecast(admin: SupabaseAdmin, userId: string, input: ForecastEngineInput): Promise<ForecastEngineResult> {
  const keywordCount = (input.keywords ?? []).length

  const { data: integrations } = await admin
    .from('ad_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('platform', ['google', 'meta'])
  const googleIntegration = (integrations ?? []).find((i: Record<string, unknown>) => i.platform === 'google') ?? null
  const metaIntegration   = (integrations ?? []).find((i: Record<string, unknown>) => i.platform === 'meta')   ?? null

  const perPlatform: { google: PlatformOutcome; meta: PlatformOutcome } = {
    google: googleIntegration ? { source: 'error', detail: 'not attempted' } : { source: 'not_connected' },
    meta:   metaIntegration   ? { source: 'error', detail: 'not attempted' } : { source: 'not_connected' },
  }

  let cpcMultiplier = 1.0
  let overallSource: 'platform_forecast' | 'heuristic' = 'heuristic'

  if (metaIntegration) {
    perPlatform.meta = await callMetaForecast(metaIntegration, input)
    if (perPlatform.meta.source === 'platform_forecast' && perPlatform.meta.cpc_adjustment) {
      cpcMultiplier = perPlatform.meta.cpc_adjustment
    }
  }

  // Heuristic (with Meta's reach-density adjustment folded in, if any) — this
  // is the baseline / fallback, and also the final answer when Google isn't
  // connected or its call fails.
  const heuristic = computeHeuristicForecast({
    budget: input.budget, days: input.days, industry: input.industry,
    severity: input.severity, opportunityScore: input.opportunityScore, keywordCount,
  })
  let predicted_leads  = heuristic.predicted_leads
  let predicted_cpc    = Math.round(heuristic.predicted_cpc * cpcMultiplier * 100) / 100
  let predicted_cpl    = predicted_leads > 0
    ? Math.round((input.budget * Math.max(1, input.days) / predicted_leads) * 100) / 100
    : heuristic.predicted_cpl
  let confidence_score = heuristic.confidence_score
  if (perPlatform.meta.source === 'platform_forecast') confidence_score = Math.min(0.97, confidence_score + 0.05)

  if (googleIntegration) {
    perPlatform.google = await callGoogleForecast(admin, googleIntegration, input)
    if (perPlatform.google.source === 'platform_forecast') {
      const clicks   = perPlatform.google.clicks!
      const avgCpc   = perPlatform.google.avg_cpc!
      const baseline = heuristic.explanation.adjusted_cvr // reuse industry+severity+keyword-adjusted conversion rate
      const leads    = Math.max(0, Math.round(clicks * baseline * 10) / 10)
      predicted_leads  = leads
      predicted_cpc    = avgCpc
      predicted_cpl    = leads > 0 ? Math.round((clicks * avgCpc) / leads * 100) / 100 : predicted_cpl
      confidence_score = Math.min(0.97, confidence_score + 0.15)
      overallSource     = 'platform_forecast'
    }
  }

  return {
    predicted_leads,
    predicted_cpc,
    predicted_cpl,
    confidence_score,
    source: overallSource,
    window_days: Math.max(1, input.days),
    daily_budget: input.budget,
    per_platform: perPlatform,
    explanation: heuristic.explanation,
  }
}
