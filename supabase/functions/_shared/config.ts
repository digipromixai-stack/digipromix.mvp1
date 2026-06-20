/**
 * Shared runtime config for all edge functions.
 *
 * API versions are read from Supabase secrets first so they can be bumped
 * without a code redeploy. Fall back to the last-known-good version.
 *
 * To update: set the secret in Supabase Dashboard → Edge Functions → Secrets
 *   META_GRAPH_VERSION=v21.0
 *   GOOGLE_ADS_VERSION=v21
 */

const metaVersion  = Deno.env.get('META_GRAPH_VERSION')  ?? 'v19.0'
const googleVersion = Deno.env.get('GOOGLE_ADS_VERSION') ?? 'v20'

export const META_GRAPH  = `https://graph.facebook.com/${metaVersion}`
export const GOOGLE_ADS_API = `https://googleads.googleapis.com/${googleVersion}`

// ── Campaign targeting defaults ───────────────────────────────────────────────
// Override per-request via body params; these are the safe production defaults.
export const DEFAULT_COUNTRIES: string[] = (Deno.env.get('DEFAULT_TARGET_COUNTRIES') ?? 'US').split(',').map(s => s.trim())
export const DEFAULT_AGE_MIN = Number(Deno.env.get('DEFAULT_AGE_MIN') ?? '18')
export const DEFAULT_AGE_MAX = Number(Deno.env.get('DEFAULT_AGE_MAX') ?? '65')

// ── Google Ads campaign defaults ─────────────────────────────────────────────
export const CAMPAIGN_DURATION_DAYS = Number(Deno.env.get('CAMPAIGN_DURATION_DAYS') ?? '365')
// Max CPC = min(budget × ratio, hard_cap). Both configurable.
export const CPC_BUDGET_RATIO = Number(Deno.env.get('CPC_BUDGET_RATIO') ?? '0.3')
export const CPC_HARD_CAP_USD = Number(Deno.env.get('CPC_HARD_CAP_USD') ?? '5')
export const KEYWORD_LIMIT    = Number(Deno.env.get('KEYWORD_LIMIT') ?? '8')

// ── Optimization engine thresholds ────────────────────────────────────────────
export const OPT_RISING_CPC_MULT      = Number(Deno.env.get('OPT_RISING_CPC_MULT')      ?? '1.5')  // flag if recent CPC > early × this
export const OPT_DECLINING_CTR_MULT   = Number(Deno.env.get('OPT_DECLINING_CTR_MULT')   ?? '0.6')  // flag if recent CTR < early × this
export const OPT_CONVERSION_DROP_MULT = Number(Deno.env.get('OPT_CONVERSION_DROP_MULT') ?? '0.5')  // flag if recent CVR < early × this
export const OPT_FATIGUE_IMP_STABLE   = Number(Deno.env.get('OPT_FATIGUE_IMP_STABLE')   ?? '0.25') // impressions within ±25% = "stable"
export const OPT_FATIGUE_CTR_MULT     = Number(Deno.env.get('OPT_FATIGUE_CTR_MULT')     ?? '0.7')  // CTR < early × this = fatigued
export const OPT_FATIGUE_MIN_IMP      = Number(Deno.env.get('OPT_FATIGUE_MIN_IMP')      ?? '500')  // minimum impressions to trigger fatigue
export const OPT_MIN_CLICKS_CVR       = Number(Deno.env.get('OPT_MIN_CLICKS_CVR')       ?? '10')   // minimum recent clicks for CVR drop detector
export const OPT_LOOKBACK_DAYS        = Number(Deno.env.get('OPT_LOOKBACK_DAYS')        ?? '14')   // days of metrics to fetch
