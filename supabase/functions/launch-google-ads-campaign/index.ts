/**
 * launch-google-ads-campaign Edge Function v11 — SELF + MANAGED (MCC)
 *
 * POST { campaign_id, daily_budget_usd?, landing_page_url? }
 *
 * SELF mode  → uses the user's OAuth-connected ad account (existing flow)
 * MANAGED mode → provisions a sub-account under DigiPromix's MCC and runs
 *                the campaign from there. Requires GOOGLE_ADS_MCC_ID and
 *                GOOGLE_ADS_MCC_REFRESH_TOKEN to be configured.
 *
 * Reads campaigns.launch_mode to decide the path.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ADS_API = 'https://googleads.googleapis.com/v20'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Text helpers ──────────────────────────────────────────────────────────────

function sanitize(s: string): string {
  return String(s ?? '')
    .replace(/[–—]/g, '-')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitChunks(text: string, maxLen: number): string[] {
  const clean = sanitize(text)
  if (!clean) return []
  if (clean.length <= maxLen) return [clean]
  const words = clean.split(' ')
  const chunks: string[] = []
  let current = ''
  for (const word of words) {
    const w = word.slice(0, maxLen)
    const candidate = current ? `${current} ${w}` : w
    if (candidate.length <= maxLen) current = candidate
    else { if (current) chunks.push(current); current = w }
  }
  if (current) chunks.push(current)
  return chunks
}

function buildHeadlines(sources: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const src of sources) {
    if (!src) continue
    for (const chunk of splitChunks(src, 30)) {
      if (!seen.has(chunk)) { seen.add(chunk); out.push(chunk); if (out.length >= 15) return out }
    }
  }
  while (out.length < 3) out.push(out[0]?.slice(0, 30) ?? 'Learn More')
  return out
}

function buildDescriptions(sources: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const src of sources) {
    if (!src) continue
    const clean = sanitize(src).slice(0, 90)
    if (clean && !seen.has(clean)) { seen.add(clean); out.push(clean); if (out.length >= 4) return out }
  }
  while (out.length < 2) out.push(out[0]?.slice(0, 90) ?? 'Click to learn more')
  return out
}

// ── Secrets / OAuth ───────────────────────────────────────────────────────────

async function getSecret(
  supabase: SupabaseClient,
  envName: string,
  vaultName: string,
): Promise<string | null> {
  const fromEnv = Deno.env.get(envName)
  if (fromEnv) return fromEnv
  const { data } = await supabase.rpc('get_vault_secret', { secret_name: vaultName })
  return (data as string | null) ?? null
}

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  return res.json() as Promise<{ access_token?: string; expires_in?: number; error?: string }>
}

// ── Google Ads API plumbing ───────────────────────────────────────────────────

interface AdsCtx {
  customerId: string         // operating customer (the account where the campaign lives)
  loginCustomerId: string | null   // MCC manager (required when operating on a sub-account)
  accessToken: string
  devToken: string
}

async function mutate(ctx: AdsCtx, path: string, operations: unknown[]) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ctx.accessToken}`,
    'developer-token': ctx.devToken,
    'Content-Type': 'application/json',
  }
  if (ctx.loginCustomerId) headers['login-customer-id'] = ctx.loginCustomerId

  const res = await fetch(`${ADS_API}/customers/${ctx.customerId}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ operations }),
  })
  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

function adsError(data: Record<string, unknown>, prefix: string): string {
  const errObj = (data?.error ?? {}) as Record<string, unknown>
  const details = (errObj?.details as Record<string, unknown>[] | undefined)?.[0]
  const inner = (details?.errors as Record<string, unknown>[] | undefined)?.[0]
  if (inner) {
    const message = inner.message ?? ''
    const location = inner.location as Record<string, unknown> | undefined
    const fieldPath = (location?.fieldPathElements as Record<string, unknown>[] | undefined)
      ?.map((f) => f.fieldName).join('.')
    const errorCode = JSON.stringify(inner.errorCode ?? {})
    return `${prefix}: ${message} [field: ${fieldPath ?? 'unknown'}] [code: ${errorCode}]`
  }
  return `${prefix}: ${errObj?.message ?? JSON.stringify(data).slice(0, 500)}`
}

// ── MANAGED-mode helpers (MCC sub-account provisioning) ───────────────────────

/**
 * Provision a Google Ads sub-account under our MCC and persist it.
 * Returns the new customer ID (digits only).
 * https://developers.google.com/google-ads/api/rest/reference/rest/v20/customers/createCustomerClient
 */
async function provisionMccSubAccount(
  admin: SupabaseClient,
  ctx: { mccId: string; accessToken: string; devToken: string },
  userId: string,
  businessName: string,
  currency: string,
  timezone: string,
): Promise<{ customerId: string; resourceName: string }> {
  const res = await fetch(`${ADS_API}/customers/${ctx.mccId}:createCustomerClient`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      'developer-token': ctx.devToken,
      'login-customer-id': ctx.mccId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customerClient: {
        descriptiveName: sanitize(businessName).slice(0, 255) || 'DigiPromix Client',
        currencyCode: currency,
        timeZone: timezone,
      },
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(adsError(data, 'MCC sub-account creation'))

  // resourceName is like "customers/1234567890"
  const resourceName: string = data.resourceName ?? ''
  const customerId = resourceName.split('/').pop() ?? ''
  if (!customerId) throw new Error('MCC sub-account creation returned no customer id')

  await admin.from('managed_ads_accounts').upsert({
    user_id: userId,
    platform: 'google',
    external_account_id: customerId,
    resource_name: resourceName,
    business_name: businessName,
    currency_code: currency,
    timezone,
    billing_status: 'pending',
  }, { onConflict: 'user_id,platform' })

  return { customerId, resourceName }
}

/** Get or provision the MCC sub-account for this user. */
async function ensureMccSubAccount(
  admin: SupabaseClient,
  mccCtx: { mccId: string; accessToken: string; devToken: string },
  userId: string,
  businessName: string,
): Promise<{ customerId: string; isNew: boolean }> {
  const { data: existing } = await admin
    .from('managed_ads_accounts')
    .select('external_account_id')
    .eq('user_id', userId)
    .eq('platform', 'google')
    .maybeSingle()

  if (existing?.external_account_id) {
    return { customerId: existing.external_account_id as string, isNew: false }
  }

  const created = await provisionMccSubAccount(
    admin, mccCtx, userId, businessName, 'USD', 'America/New_York',
  )
  return { customerId: created.customerId, isNew: true }
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

    const { campaign_id, daily_budget_usd = 10, landing_page_url } = await req.json()
    if (!campaign_id) return json({ error: 'campaign_id required' }, 400)

    // Fetch campaign
    const { data: campaign, error: campErr } = await admin
      .from('campaigns').select('*')
      .eq('id', campaign_id).eq('user_id', user.id).single()
    if (campErr || !campaign) return json({ error: 'Campaign not found' }, 404)

    const launchMode = (campaign.launch_mode as 'self' | 'managed' | null) ?? 'self'

    // Shared secrets (used for both modes)
    const clientId     = await getSecret(admin, 'GOOGLE_ADS_CLIENT_ID', 'google_ads_client_id')
    const clientSecret = await getSecret(admin, 'GOOGLE_ADS_CLIENT_SECRET', 'google_ads_client_secret')
    const devToken     = await getSecret(admin, 'GOOGLE_ADS_DEVELOPER_TOKEN', 'google_ads_developer_token')
    if (!clientId || !clientSecret || !devToken) {
      return json({ error: 'Google Ads API credentials not configured' }, 500)
    }

    // ─── Resolve operating context based on launch mode ────────────────────────
    let ctx: AdsCtx

    if (launchMode === 'managed') {
      // MANAGED — reuse the existing OAuth pattern: the SaaS operator connects
      // their MCC manager Google account via google-ads-oauth and flags the
      // integration row with is_agency_manager = true. We read MCC ID +
      // refresh_token directly from that row, so no extra env vars are needed.
      const { data: agency } = await admin
        .from('ad_integrations')
        .select('*')
        .eq('platform', 'google')
        .eq('is_agency_manager', true)
        .eq('is_active', true)
        .maybeSingle()

      if (!agency || !agency.refresh_token) {
        const msg = 'Managed mode not configured — connect your MCC manager Google account via Settings and mark it as the agency-manager integration (is_agency_manager = true on ad_integrations).'
        await admin.from('campaigns').update({
          google_error: msg, managed_provision_status: 'failed',
        }).eq('id', campaign_id)
        return json({ error: msg, code: 'managed_not_configured' }, 503)
      }

      // The MCC ID is either explicitly stored as login_customer_id, or it IS
      // the account_id of the integration if the agency connected the MCC directly.
      const mccId = (agency.login_customer_id as string | null) ?? (agency.account_id as string)
      const mccRefreshToken = agency.refresh_token as string

      // Refresh MCC manager token (reuses the same OAuth client as user flow)
      const refreshed = await refreshAccessToken(mccRefreshToken, clientId, clientSecret)
      if (refreshed.error || !refreshed.access_token) {
        const msg = `MCC manager token refresh failed: ${refreshed.error ?? 'unknown'}`
        await admin.from('campaigns').update({ google_error: msg, managed_provision_status: 'failed' }).eq('id', campaign_id)
        return json({ error: msg }, 500)
      }

      const mccAccessToken = refreshed.access_token
      const mccCleanId = mccId.replace(/-/g, '')

      // Provision sub-account on first managed launch (or reuse existing)
      await admin.from('campaigns').update({ managed_provision_status: 'provisioning' }).eq('id', campaign_id)

      let subAccount: { customerId: string; isNew: boolean }
      try {
        subAccount = await ensureMccSubAccount(
          admin,
          { mccId: mccCleanId, accessToken: mccAccessToken, devToken },
          user.id,
          (campaign.managed_business_name as string | null) ?? campaign.competitor_name ?? 'DigiPromix Client',
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'MCC sub-account provisioning failed'
        await admin.from('campaigns').update({
          google_error: msg, managed_provision_status: 'failed',
        }).eq('id', campaign_id)
        return json({ error: msg }, 500)
      }

      ctx = {
        customerId: subAccount.customerId,
        loginCustomerId: mccCleanId,
        accessToken: mccAccessToken,
        devToken,
      }

      // If this sub-account was just provisioned, generate the Google Ads
      // billing setup URL and persist it. The frontend uses this to prompt
      // the user "Add billing to activate your ads."
      if (subAccount.isNew) {
        const billingUrl = `https://ads.google.com/aw/billing/paymentsprofile?ocid=${subAccount.customerId}`
        await admin.from('managed_ads_accounts').update({
          billing_invite_link: billingUrl,
          billing_status: 'invited',
        }).eq('user_id', user.id).eq('platform', 'google')
      }

      await admin.from('campaigns').update({ managed_provision_status: 'active' }).eq('id', campaign_id)
    } else {
      // SELF — existing OAuth-connected user account flow
      const { data: integration, error: intErr } = await admin
        .from('ad_integrations').select('*')
        .eq('user_id', user.id).eq('platform', 'google').eq('is_active', true).single()
      if (intErr || !integration) return json({ error: 'Google Ads account not connected. Please connect in Settings or switch this campaign to managed mode.' }, 400)

      let accessToken = integration.access_token as string
      const refreshToken = integration.refresh_token as string | null
      if (refreshToken) {
        const refreshed = await refreshAccessToken(refreshToken, clientId, clientSecret)
        if (refreshed.error) {
          await admin.from('ad_integrations').update({ is_active: false }).eq('id', integration.id)
          return json({ error: 'Google Ads token expired or revoked. Please reconnect your Google Ads account in Settings.' }, 401)
        }
        if (refreshed.access_token) {
          accessToken = refreshed.access_token
          const newExpiry = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString()
          await admin.from('ad_integrations').update({
            access_token: accessToken,
            token_expires_at: newExpiry,
          }).eq('id', integration.id)
        }
      }

      const customerId = (integration.account_id as string).replace(/-/g, '')
      const rawLoginId = (integration.login_customer_id as string | null)?.replace(/-/g, '') ?? null
      const loginCustomerId = rawLoginId && rawLoginId !== customerId ? rawLoginId : null
      ctx = { customerId, loginCustomerId, accessToken, devToken }
    }

    // ─── Landing URL (required for SEARCH ads) ────────────────────────────────
    const rawUrl = (landing_page_url ?? campaign.landing_page_url) as string | null | undefined
    if (!rawUrl || !rawUrl.trim()) {
      const msg = 'Landing page URL is missing. Set landing_page_url on the campaign or publish a landing page first.'
      await admin.from('campaigns').update({ google_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, 400)
    }
    const finalUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`

    // ── 1. Campaign Budget ─────────────────────────────────────────────────────
    const budgetRes = await mutate(ctx, '/campaignBudgets:mutate', [{
      create: {
        name: sanitize(`${campaign.campaign_name} Budget ${Date.now()}`).slice(0, 255),
        amountMicros: String(Math.round(daily_budget_usd * 1_000_000)),
        explicitlyShared: false,
      },
    }])
    if (!budgetRes.ok) {
      const msg = adsError(budgetRes.data, 'Budget')
      await admin.from('campaigns').update({ google_error: msg }).eq('id', campaign_id)
      return json({ error: `Google Ads API (${msg})`, raw: budgetRes.data }, 400)
    }
    const budgetRN: string = budgetRes.data.results[0].resourceName

    // ── 2. Campaign (PAUSED Search) ────────────────────────────────────────────
    const now = new Date()
    const start = now.toISOString().slice(0, 10).replace(/-/g, '')
    const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')

    const campaignRes = await mutate(ctx, '/campaigns:mutate', [{
      create: {
        name: sanitize(`${campaign.campaign_name} ${Date.now()}`).slice(0, 255),
        status: launchMode === 'managed' ? 'PAUSED' : 'ENABLED',  // managed starts paused — agency reviews before going live
        advertisingChannelType: 'SEARCH',
        manualCpc: { enhancedCpcEnabled: false },
        campaignBudget: budgetRN,
        startDate: start,
        endDate: end,
        containsEuPoliticalAdvertising: 2,
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false,
        },
      },
    }])
    if (!campaignRes.ok) {
      const msg = adsError(campaignRes.data, 'Campaign')
      await admin.from('campaigns').update({ google_error: msg }).eq('id', campaign_id)
      return json({ error: `Google Ads API (${msg})`, raw: campaignRes.data }, 400)
    }
    const gCampaignRN: string = campaignRes.data.results[0].resourceName
    const gCampaignId = gCampaignRN.split('/').pop()!

    // ── 3. Ad Group ────────────────────────────────────────────────────────────
    const adGroupRes = await mutate(ctx, '/adGroups:mutate', [{
      create: {
        name: sanitize(`${campaign.campaign_name} - Ad Group`).slice(0, 255),
        status: 'ENABLED',
        campaign: gCampaignRN,
        type: 'SEARCH_STANDARD',
        cpcBidMicros: '1000000',
      },
    }])
    if (!adGroupRes.ok) {
      const msg = adsError(adGroupRes.data, 'AdGroup')
      await admin.from('campaigns').update({ google_campaign_id: gCampaignId, google_error: msg }).eq('id', campaign_id)
      return json({ error: `Google Ads API (${msg})`, raw: adGroupRes.data }, 400)
    }
    const gAdGroupRN: string = adGroupRes.data.results[0].resourceName
    const gAdGroupId = gAdGroupRN.split('/').pop()!

    // ── 4. Responsive Search Ad ────────────────────────────────────────────────
    const headlines    = buildHeadlines([campaign.headline, campaign.offer, campaign.landing_page_title, campaign.campaign_name])
    const descriptions = buildDescriptions([campaign.ad_copy, campaign.landing_page_body, campaign.offer, campaign.ad_copy])

    const adRes = await mutate(ctx, '/adGroupAds:mutate', [{
      create: {
        adGroup: gAdGroupRN,
        status: 'ENABLED',
        ad: {
          finalUrls: [finalUrl],
          responsiveSearchAd: {
            headlines: headlines.map((text) => ({ text })),
            descriptions: descriptions.map((text) => ({ text })),
          },
        },
      },
    }])
    if (!adRes.ok) {
      const msg = adsError(adRes.data, 'Ad')
      await admin.from('campaigns').update({
        google_campaign_id: gCampaignId, google_ad_group_id: gAdGroupId, google_error: msg,
      }).eq('id', campaign_id)
      return json({ error: `Google Ads API (${msg})`, raw: adRes.data }, 400)
    }
    const gAdRN: string = adRes.data.results[0].resourceName
    const gAdId = gAdRN.split('~').pop()!

    // ── 5. Keywords (best-effort) ──────────────────────────────────────────────
    const keywords = (campaign.keywords as string[] | null) ?? []
    if (keywords.length > 0) {
      const kwOps: unknown[] = []
      keywords.slice(0, 10).forEach((kw) => {
        const text = sanitize(kw).slice(0, 80)
        kwOps.push({ create: { adGroup: gAdGroupRN, status: 'ENABLED', keyword: { text, matchType: 'BROAD' } } })
        kwOps.push({ create: { adGroup: gAdGroupRN, status: 'ENABLED', keyword: { text, matchType: 'EXACT' } } })
      })
      await mutate(ctx, '/adGroupCriteria:mutate', kwOps)
    }

    // ── Save & return ──────────────────────────────────────────────────────────
    await admin.from('campaigns').update({
      google_campaign_id: gCampaignId,
      google_ad_group_id: gAdGroupId,
      google_ad_id:       gAdId,
      google_error:       null,
      status:             launchMode === 'managed' ? 'draft' : 'active',  // managed needs agency review + billing setup
      channels:           [...new Set([...((campaign.channels as string[]) ?? []), 'google'])],
      landing_page_url:   finalUrl,
    }).eq('id', campaign_id)

    // For MANAGED mode, look up the billing status / link to return to the frontend
    let billingPayload: { required: boolean; status?: string; url?: string } | null = null
    if (launchMode === 'managed') {
      const { data: mgmt } = await admin
        .from('managed_ads_accounts')
        .select('billing_status, billing_invite_link')
        .eq('user_id', user.id).eq('platform', 'google')
        .maybeSingle()

      billingPayload = {
        required: (mgmt?.billing_status ?? 'pending') !== 'active',
        status:   mgmt?.billing_status ?? 'pending',
        url:      mgmt?.billing_invite_link ?? `https://ads.google.com/aw/billing/paymentsprofile?ocid=${ctx.customerId}`,
      }
    }

    return json({
      success: true,
      mode: launchMode,
      managed_account_id: launchMode === 'managed' ? ctx.customerId : null,
      google_campaign_id: gCampaignId,
      google_ad_group_id: gAdGroupId,
      google_ad_id:       gAdId,
      billing:            billingPayload,
      message: launchMode === 'managed'
        ? 'Campaign provisioned in your DigiPromix-managed Google Ads sub-account (PAUSED). Add billing to activate ads.'
        : 'Campaign created and ENABLED in Google Ads. Ads will serve once your developer token has Basic Access.',
    })
  } catch (err) {
    console.error(err)
    return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
  }
})
