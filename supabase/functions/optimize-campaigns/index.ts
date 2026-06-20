/**
 * optimize-campaigns — MVP 2.0 §8 Campaign Optimization Engine
 *
 * For every campaign that's been launched to Meta or Google:
 *   1. Fetch the last 14 days of insights (impressions, clicks, spend,
 *      conversions, ctr, cpc, cpm) from the respective platform
 *   2. Upsert into campaign_metrics (one row per campaign · platform · day)
 *   3. Run 4 rule-based detectors per §8 of the delivery plan:
 *        • Rising CPC          (recent 3-day CPC > 1.5× early 3-day CPC)
 *        • Declining CTR       (recent 3-day CTR < 60% of early 3-day CTR)
 *        • Conversion drop     (recent 3-day CVR < 50% of early 3-day CVR)
 *        • Ad fatigue          (impressions stable + CTR -30% week-over-week)
 *   4. Insert ai_recommendations rows (idempotent — skip if a same-day
 *      recommendation already exists for that campaign + action_type)
 *   5. Backfeed outcome_* columns into campaign_embeddings so the RAG
 *      memory layer learns which past campaigns actually performed
 *
 * NO autonomous bidding, NO ML — pure rule-based per the plan (§8 explicitly
 * excludes autonomous media buying, dynamic bid algos, RL optimization).
 *
 * Schedule: pg_cron 'optimize-campaigns-daily' at 02:00 UTC.
 *
 * verify_jwt is OFF — invoked by pg_cron or scripts only.
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

import {
  META_GRAPH, GOOGLE_ADS_API as ADS_API,
  OPT_RISING_CPC_MULT, OPT_DECLINING_CTR_MULT, OPT_CONVERSION_DROP_MULT,
  OPT_FATIGUE_IMP_STABLE, OPT_FATIGUE_CTR_MULT, OPT_FATIGUE_MIN_IMP,
  OPT_MIN_CLICKS_CVR, OPT_LOOKBACK_DAYS,
} from '../_shared/config.ts'

// ── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(d: Date): string { return d.toISOString().slice(0, 10) }
function daysAgo(n: number): Date { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d }
function safeDiv(num: number, den: number): number | null { return den > 0 ? num / den : null }

interface MetricRow {
  user_id:    string
  campaign_id: string
  platform:   'meta' | 'google'
  date:       string
  impressions: number
  clicks:     number
  spend:      number
  conversions: number
  leads:      number
  ctr:        number | null
  cpc:        number | null
  cpm:        number | null
  cpl:        number | null
  raw:        Record<string, unknown>
}

// ── Meta insights fetcher ───────────────────────────────────────────────────

async function fetchMetaInsights(
  metaCampaignId: string,
  accessToken: string,
  sinceISO: string,
  untilISO: string,
): Promise<Array<Omit<MetricRow, 'user_id' | 'campaign_id' | 'platform'>>> {
  const url = `${META_GRAPH}/${metaCampaignId}/insights`
    + `?fields=impressions,clicks,spend,ctr,cpc,cpm,actions`
    + `&time_increment=1`
    + `&time_range=${encodeURIComponent(JSON.stringify({ since: sinceISO, until: untilISO }))}`
    + `&access_token=${encodeURIComponent(accessToken)}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta insights ${res.status}`)
  const body = await res.json() as { data?: Array<Record<string, unknown>> }
  return (body.data ?? []).map((row) => {
    const actions = (row.actions as Array<{ action_type: string; value: string }> | undefined) ?? []
    const conv = Number(actions.find((a) => a.action_type === 'offsite_conversion')?.value ?? 0)
    const leads = Number(actions.find((a) => a.action_type === 'lead' || a.action_type === 'leadgen.other')?.value ?? 0)
    const impressions = Number(row.impressions ?? 0)
    const clicks      = Number(row.clicks ?? 0)
    const spend       = Number(row.spend ?? 0)
    return {
      date:        String(row.date_start ?? row.date ?? ''),
      impressions, clicks, spend,
      conversions: conv,
      leads,
      ctr:         row.ctr  != null ? Number(row.ctr)  / 100 : safeDiv(clicks, impressions),
      cpc:         row.cpc  != null ? Number(row.cpc)        : safeDiv(spend, clicks),
      cpm:         row.cpm  != null ? Number(row.cpm)        : (impressions ? (spend / impressions) * 1000 : null),
      cpl:         safeDiv(spend, conv || leads),
      raw:         row,
    }
  })
}

// ── Google Ads insights fetcher ─────────────────────────────────────────────

async function refreshGoogleAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  })
  return res.json() as Promise<{ access_token?: string; error?: string }>
}

async function fetchGoogleInsights(
  customerId: string,
  loginCustomerId: string | null,
  googleCampaignId: string,
  accessToken: string,
  devToken: string,
  sinceISO: string,
  untilISO: string,
): Promise<Array<Omit<MetricRow, 'user_id' | 'campaign_id' | 'platform'>>> {
  const gaql = `
    SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros,
           metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.conversions
    FROM campaign
    WHERE campaign.id = ${googleCampaignId}
      AND segments.date BETWEEN '${sinceISO}' AND '${untilISO}'
  `.replace(/\s+/g, ' ').trim()

  const headers: Record<string, string> = {
    Authorization:    `Bearer ${accessToken}`,
    'developer-token': devToken,
    'Content-Type':   'application/json',
  }
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

  const res = await fetch(`${ADS_API}/customers/${customerId}/googleAds:search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: gaql }),
  })
  if (!res.ok) throw new Error(`Google Ads search ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = await res.json() as { results?: Array<Record<string, Record<string, unknown>>> }

  return (body.results ?? []).map((r) => {
    const d = r.segments?.date as string
    const m = r.metrics ?? {}
    const impressions = Number(m.impressions ?? 0)
    const clicks      = Number(m.clicks ?? 0)
    const spend       = Number(m.costMicros ?? 0) / 1_000_000
    const conv        = Number(m.conversions ?? 0)
    return {
      date:        d,
      impressions, clicks, spend,
      conversions: conv,
      leads:       conv,
      ctr:         m.ctr        != null ? Number(m.ctr)        : safeDiv(clicks, impressions),
      cpc:         m.averageCpc != null ? Number(m.averageCpc) / 1_000_000 : safeDiv(spend, clicks),
      cpm:         m.averageCpm != null ? Number(m.averageCpm) / 1_000_000 : (impressions ? (spend / impressions) * 1000 : null),
      cpl:         safeDiv(spend, conv),
      raw:         r,
    }
  })
}

// ── Detectors ───────────────────────────────────────────────────────────────

interface Detection {
  action_type:    'rising_cpc' | 'declining_ctr' | 'conversion_drop' | 'ad_fatigue'
  recommendation: string
  rationale:      string
  priority:       number      // 1 (low) .. 5 (urgent)
  confidence:     number      // 0..1
  metadata:       Record<string, unknown>
}

interface DayMetric {
  date: string
  impressions: number; clicks: number; spend: number
  conversions: number; ctr: number | null; cpc: number | null
}

function avg(rows: DayMetric[], key: 'impressions' | 'clicks' | 'spend' | 'conversions' | 'ctr' | 'cpc'): number {
  const vals = rows.map((r) => r[key] as number | null).filter((v): v is number => v != null && !Number.isNaN(v))
  if (vals.length === 0) return 0
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function runDetectors(metrics: DayMetric[]): Detection[] {
  if (metrics.length < 6) return []                    // need both windows

  const ordered = [...metrics].sort((a, b) => a.date.localeCompare(b.date))
  const early   = ordered.slice(0, 3)                  // first 3 days
  const recent  = ordered.slice(-3)                    // last 3 days

  const out: Detection[] = []

  // 1. Rising CPC
  const cpcEarly  = avg(early,  'cpc')
  const cpcRecent = avg(recent, 'cpc')
  if (cpcEarly > 0 && cpcRecent > cpcEarly * OPT_RISING_CPC_MULT) {
    out.push({
      action_type: 'rising_cpc',
      recommendation: 'Your cost-per-click is climbing. Refresh ad creatives or pause underperforming keywords/audiences.',
      rationale: `CPC rose from ${cpcEarly.toFixed(2)} → ${cpcRecent.toFixed(2)} (${((cpcRecent / cpcEarly - 1) * 100).toFixed(0)}% increase) over the last week.`,
      priority: cpcRecent > cpcEarly * (OPT_RISING_CPC_MULT * 1.33) ? 5 : 4,
      confidence: 0.85,
      metadata: { cpc_early: +cpcEarly.toFixed(2), cpc_recent: +cpcRecent.toFixed(2), window: 'last_7d_vs_first_3d' },
    })
  }

  // 2. Declining CTR
  const ctrEarly  = avg(early,  'ctr')
  const ctrRecent = avg(recent, 'ctr')
  if (ctrEarly > 0 && ctrRecent < ctrEarly * OPT_DECLINING_CTR_MULT) {
    out.push({
      action_type: 'declining_ctr',
      recommendation: 'CTR has fallen sharply. Test new headlines/images, A/B 2-3 variants for the next 5 days.',
      rationale: `CTR dropped from ${(ctrEarly * 100).toFixed(2)}% → ${(ctrRecent * 100).toFixed(2)}% (${((1 - ctrRecent / ctrEarly) * 100).toFixed(0)}% decrease).`,
      priority: ctrRecent < ctrEarly * (OPT_DECLINING_CTR_MULT * 0.67) ? 5 : 4,
      confidence: 0.80,
      metadata: { ctr_early: +ctrEarly.toFixed(4), ctr_recent: +ctrRecent.toFixed(4) },
    })
  }

  // 3. Conversion-rate drop
  const cvrEarly  = (avg(early,  'conversions') / Math.max(1, avg(early,  'clicks')))
  const cvrRecent = (avg(recent, 'conversions') / Math.max(1, avg(recent, 'clicks')))
  if (cvrEarly > 0 && cvrRecent < cvrEarly * OPT_CONVERSION_DROP_MULT && avg(recent, 'clicks') > OPT_MIN_CLICKS_CVR) {
    out.push({
      action_type: 'conversion_drop',
      recommendation: 'Conversion rate has fallen by more than half. Check the landing page — broken form, slow load, or copy mismatch with the ad.',
      rationale: `Conversion rate fell ${(cvrEarly * 100).toFixed(2)}% → ${(cvrRecent * 100).toFixed(2)}%.`,
      priority: 5,
      confidence: 0.75,
      metadata: { cvr_early: +cvrEarly.toFixed(4), cvr_recent: +cvrRecent.toFixed(4) },
    })
  }

  // 4. Ad fatigue — impressions stable, CTR dropping
  const impEarly  = avg(early,  'impressions')
  const impRecent = avg(recent, 'impressions')
  const impStable = impEarly > 0 && Math.abs(impRecent - impEarly) / impEarly < OPT_FATIGUE_IMP_STABLE
  if (impStable && ctrEarly > 0 && ctrRecent < ctrEarly * OPT_FATIGUE_CTR_MULT && impRecent > OPT_FATIGUE_MIN_IMP) {
    out.push({
      action_type: 'ad_fatigue',
      recommendation: 'Your audience has seen this ad too many times — rotate the creative. Frequency cap or refresh the image/copy.',
      rationale: `Impressions held steady (${impEarly.toFixed(0)} → ${impRecent.toFixed(0)}) but CTR dropped from ${(ctrEarly * 100).toFixed(2)}% to ${(ctrRecent * 100).toFixed(2)}% — classic fatigue signal.`,
      priority: 3,
      confidence: 0.70,
      metadata: { impressions_early: +impEarly.toFixed(0), impressions_recent: +impRecent.toFixed(0) },
    })
  }

  return out
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

    const body = await req.json().catch(() => ({}))
    const onlyCampaign = (body as { campaign_id?: string }).campaign_id ?? null
    const lookbackDays = Math.min(60, Math.max(7, Number((body as { lookback_days?: number }).lookback_days) || OPT_LOOKBACK_DAYS))

    // ── Pull active campaigns that have a launched platform ID ───────────
    let q = admin.from('campaigns').select(`
      id, user_id, channels, daily_budget,
      meta_campaign_id, meta_adset_id, meta_ad_id,
      google_campaign_id, google_ad_id
    `)
    if (onlyCampaign) {
      q = q.eq('id', onlyCampaign)
    } else {
      // Only consider campaigns that actually launched on at least one platform
      // AND aren't in a terminal/failed state. Using filter() builds the OR safely.
      q = q.in('status', ['active', 'paused', 'completed'])
            .or('meta_campaign_id.not.is.null,google_campaign_id.not.is.null')
    }

    const { data: campaigns, error: cErr } = await q
    if (cErr) return json({ error: cErr.message }, 500)
    if (!campaigns || campaigns.length === 0) return json({ checked: 0, reason: 'no_launched_campaigns' })

    // Cache ad integrations per user
    const integrationCache = new Map<string, { meta: any; google: any }>()
    async function getIntegrations(userId: string) {
      if (integrationCache.has(userId)) return integrationCache.get(userId)!
      const { data } = await admin.from('ad_integrations')
        .select('platform, access_token, refresh_token, account_id, login_customer_id')
        .eq('user_id', userId).eq('is_active', true)
      const cache = {
        meta:   (data ?? []).find((d) => d.platform === 'meta')   ?? null,
        google: (data ?? []).find((d) => d.platform === 'google') ?? null,
      }
      integrationCache.set(userId, cache)
      return cache
    }

    const sinceISO = isoDate(daysAgo(lookbackDays))
    const untilISO = isoDate(new Date())

    let metricsIngested = 0
    let recsCreated     = 0
    let campaignsScanned = 0
    const errors: Array<{ campaign_id: string; platform: string; error: string }> = []

    for (const c of campaigns) {
      campaignsScanned++
      const integrations = await getIntegrations(c.user_id as string)
      const allRows: MetricRow[] = []

      // ── META ───────────────────────────────────────────────────────
      if (c.meta_campaign_id && integrations.meta?.access_token) {
        try {
          const days = await fetchMetaInsights(
            c.meta_campaign_id as string,
            integrations.meta.access_token as string,
            sinceISO, untilISO,
          )
          for (const d of days) {
            allRows.push({
              user_id:     c.user_id as string,
              campaign_id: c.id as string,
              platform:    'meta',
              ...d,
            })
          }
        } catch (e) {
          errors.push({ campaign_id: c.id as string, platform: 'meta', error: String(e).slice(0, 200) })
        }
      }

      // ── GOOGLE ─────────────────────────────────────────────────────
      if (c.google_campaign_id && integrations.google?.refresh_token) {
        try {
          const clientId     = Deno.env.get('GOOGLE_ADS_CLIENT_ID')
            ?? (await admin.rpc('get_vault_secret', { secret_name: 'google_ads_client_id' })).data
          const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET')
            ?? (await admin.rpc('get_vault_secret', { secret_name: 'google_ads_client_secret' })).data
          const devToken     = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')
            ?? (await admin.rpc('get_vault_secret', { secret_name: 'google_ads_developer_token' })).data
          if (clientId && clientSecret && devToken) {
            const refreshed = await refreshGoogleAccessToken(
              integrations.google.refresh_token as string, clientId, clientSecret,
            )
            if (refreshed.access_token) {
              const customerId      = (integrations.google.account_id as string).replace(/-/g, '')
              const loginCustomerId = (integrations.google.login_customer_id as string | null)?.replace(/-/g, '') ?? null
              const days = await fetchGoogleInsights(
                customerId,
                loginCustomerId !== customerId ? loginCustomerId : null,
                c.google_campaign_id as string,
                refreshed.access_token, devToken, sinceISO, untilISO,
              )
              for (const d of days) {
                allRows.push({
                  user_id:     c.user_id as string,
                  campaign_id: c.id as string,
                  platform:    'google',
                  ...d,
                })
              }
            }
          }
        } catch (e) {
          errors.push({ campaign_id: c.id as string, platform: 'google', error: String(e).slice(0, 200) })
        }
      }

      // ── Upsert metric rows ─────────────────────────────────────────
      if (allRows.length > 0) {
        const { error: upErr } = await admin
          .from('campaign_metrics')
          .upsert(allRows, { onConflict: 'campaign_id,platform,date' })
        if (!upErr) metricsIngested += allRows.length
        else errors.push({ campaign_id: c.id as string, platform: 'db', error: upErr.message })
      }

      // ── Run detectors per platform from campaign_metrics (resilient to
      //    API fetch failure — uses whatever historical data we have) ──
      for (const platform of ['meta', 'google'] as const) {
        const { data: storedMetrics } = await admin
          .from('campaign_metrics')
          .select('date, impressions, clicks, spend, conversions, ctr, cpc')
          .eq('campaign_id', c.id)
          .eq('platform', platform)
          .gte('date', sinceISO)
          .order('date', { ascending: true })

        if (!storedMetrics || storedMetrics.length < 6) continue

        const detections = runDetectors(storedMetrics.map((r: Record<string, unknown>) => ({
          date:        r.date as string,
          impressions: Number(r.impressions ?? 0),
          clicks:      Number(r.clicks ?? 0),
          spend:       Number(r.spend ?? 0),
          conversions: Number(r.conversions ?? 0),
          ctr:         r.ctr != null ? Number(r.ctr) : null,
          cpc:         r.cpc != null ? Number(r.cpc) : null,
        })))

        for (const det of detections) {
          // Idempotency: skip if same campaign+action_type already has an
          // active (not applied/dismissed) recommendation from the last 7 days
          const { data: existing } = await admin.from('ai_recommendations')
            .select('id').eq('campaign_id', c.id)
            .eq('action_type', det.action_type)
            .is('applied_at', null).is('dismissed_at', null)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .limit(1).maybeSingle()
          if (existing) continue

          const { error: recErr } = await admin.from('ai_recommendations').insert({
            user_id:        c.user_id,
            campaign_id:    c.id,
            action_type:    det.action_type,
            recommendation: det.recommendation,
            rationale:      det.rationale,
            priority:       det.priority,
            confidence:     det.confidence,
            metadata:       { platform, ...det.metadata },
          })
          if (!recErr) {
            recsCreated++
          } else {
            errors.push({ campaign_id: c.id as string, platform, error: `rec_insert:${recErr.code}:${recErr.message}` })
          }
        }
      }

      // ── Backfeed outcome_* to campaign_embeddings (close the RAG loop) ──
      if (allRows.length > 0) {
        const totals = allRows.reduce((s, r) => ({
          impressions: s.impressions + r.impressions,
          clicks:      s.clicks      + r.clicks,
          spend:       s.spend       + r.spend,
          conversions: s.conversions + r.conversions,
          leads:       s.leads       + r.leads,
        }), { impressions: 0, clicks: 0, spend: 0, conversions: 0, leads: 0 })

        await admin.from('campaign_embeddings').update({
          outcome_impressions: totals.impressions,
          outcome_clicks:      totals.clicks,
          outcome_spend:       totals.spend,
          outcome_conversions: totals.conversions,
          outcome_leads:       totals.leads,
        }).eq('campaign_id', c.id)
      }
    }

    // ── Kickoff recommendations ──────────────────────────────────────────
    // For any active campaign that has NEVER received a recommendation,
    // generate a helpful starter recommendation so the UI isn't empty.
    // This also surfaces when a user hasn't connected their ad account yet.
    const { data: activeCampaigns } = await admin
      .from('campaigns')
      .select('id, user_id, campaign_name, status, created_at, daily_budget, meta_campaign_id, google_campaign_id')
      .in('status', ['active', 'paused'])

    for (const c of (activeCampaigns ?? [])) {
      // Skip if already has any recommendation
      const { count: recCount } = await admin
        .from('ai_recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id)
      if ((recCount ?? 0) > 0) continue

      const daysActive = Math.round(
        (Date.now() - new Date(c.created_at as string).getTime()) / (1000 * 60 * 60 * 24)
      )
      const hasAdPlatform = !!(c.meta_campaign_id || c.google_campaign_id)

      const rec = hasAdPlatform
        ? {
            action_type: 'performance_check',
            recommendation: `Your campaign has been running for ${daysActive} day${daysActive !== 1 ? 's' : ''}. Once your ad account delivers at least 6 days of impressions, AI will automatically analyse CPC trends, CTR shifts, and conversion patterns here.`,
            rationale:  'Campaign launched but not enough performance data has been collected yet for statistical analysis. AI optimization activates after 6 days of delivery data.',
            priority:   2,
            confidence: 1.0,
            metadata:   { type: 'kickoff', days_active: daysActive, has_platform: true },
          }
        : {
            action_type: 'setup_tracking',
            recommendation: 'Connect your Meta or Google Ads account in Settings → Integrations to enable real-time performance monitoring and daily AI optimization for this campaign.',
            rationale:  'No ad platform is linked to this campaign. AI optimization requires impression, click, and spend data from a connected ad account.',
            priority:   4,
            confidence: 1.0,
            metadata:   { type: 'kickoff', days_active: daysActive, has_platform: false },
          }

      const { error: kickoffErr } = await admin.from('ai_recommendations').insert({
        user_id:        c.user_id,
        campaign_id:    c.id,
        ...rec,
      })
      if (!kickoffErr) recsCreated++
      else errors.push({ campaign_id: c.id as string, platform: 'kickoff', error: `${kickoffErr.code}:${kickoffErr.message}` })
    }

    return json({
      campaigns_scanned:   campaignsScanned,
      metrics_ingested:    metricsIngested,
      recommendations_created: recsCreated,
      errors,
    })
  } catch (err) {
    console.error('optimize-campaigns error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
