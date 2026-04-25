/**
 * launch-google-ads-campaign Edge Function
 *
 * POST { campaign_id, daily_budget_usd?, landing_page_url? }
 *
 * Creates a PAUSED Search campaign in Google Ads via the REST API v17:
 *   Campaign Budget → Campaign → Ad Group → Responsive Search Ad → Keywords
 *
 * Refreshes the OAuth access token using the stored refresh_token.
 * All objects are created with status=PAUSED — user must activate
 * manually in Google Ads UI.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ADS_API = 'https://googleads.googleapis.com/v17'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function getSecret(
  supabase: ReturnType<typeof createClient>,
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
  return res.json() as Promise<{ access_token?: string; expires_in?: number; error?: string; error_description?: string }>
}

interface AdsCtx {
  customerId: string
  loginCustomerId: string | null
  accessToken: string
  devToken: string
}

async function adsMutate(ctx: AdsCtx, path: string, operations: unknown[]) {
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

    // Fetch Google integration
    const { data: integration, error: intErr } = await admin
      .from('ad_integrations').select('*')
      .eq('user_id', user.id).eq('platform', 'google').eq('is_active', true).single()
    if (intErr || !integration) return json({ error: 'Google Ads account not connected. Please connect in Settings.' }, 400)

    const clientId     = await getSecret(admin, 'GOOGLE_ADS_CLIENT_ID', 'google_ads_client_id')
    const clientSecret = await getSecret(admin, 'GOOGLE_ADS_CLIENT_SECRET', 'google_ads_client_secret')
    const devToken     = await getSecret(admin, 'GOOGLE_ADS_DEVELOPER_TOKEN', 'google_ads_developer_token')
    if (!clientId || !clientSecret || !devToken) return json({ error: 'Google Ads API credentials not configured' }, 500)

    // Refresh access token (Google tokens are 1h; always refresh for safety)
    let accessToken = integration.access_token as string
    const refreshToken = integration.refresh_token as string | null
    if (refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken, clientId, clientSecret)
      if (refreshed.access_token) {
        accessToken = refreshed.access_token
        const newExpiry = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString()
        await admin.from('ad_integrations').update({
          access_token: accessToken,
          token_expires_at: newExpiry,
        }).eq('id', integration.id)
      }
    }

    const ctx: AdsCtx = {
      customerId: integration.account_id as string,
      loginCustomerId: (integration.login_customer_id as string | null) ?? (integration.account_id as string),
      accessToken,
      devToken,
    }

    const finalUrl = landing_page_url ?? campaign.landing_page_url ?? 'https://example.com'

    // ── 1. Campaign Budget ─────────────────────────────────────────
    const budgetOp = {
      create: {
        name: `${campaign.campaign_name} – Budget ${Date.now()}`,
        amountMicros: String(Math.round(daily_budget_usd * 1_000_000)),
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      },
    }
    const budgetRes = await adsMutate(ctx, '/campaignBudgets:mutate', [budgetOp])
    if (!budgetRes.ok) {
      const msg = budgetRes.data?.error?.message ?? JSON.stringify(budgetRes.data).slice(0, 500)
      await admin.from('campaigns').update({ google_error: `Budget: ${msg}` }).eq('id', campaign_id)
      return json({ error: `Google Ads API (Budget): ${msg}` }, 400)
    }
    const budgetResourceName: string = budgetRes.data.results[0].resourceName

    // ── 2. Campaign (PAUSED Search campaign) ───────────────────────
    const now = new Date()
    const start = now.toISOString().slice(0, 10).replace(/-/g, '')
    const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')

    const campaignOp = {
      create: {
        name: `${campaign.campaign_name} ${Date.now()}`,
        status: 'PAUSED',
        advertisingChannelType: 'SEARCH',
        manualCpc: { enhancedCpcEnabled: false },
        campaignBudget: budgetResourceName,
        startDate: start,
        endDate: end,
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false,
        },
      },
    }
    const campaignRes = await adsMutate(ctx, '/campaigns:mutate', [campaignOp])
    if (!campaignRes.ok) {
      const msg = campaignRes.data?.error?.message ?? JSON.stringify(campaignRes.data).slice(0, 500)
      await admin.from('campaigns').update({ google_error: `Campaign: ${msg}` }).eq('id', campaign_id)
      return json({ error: `Google Ads API (Campaign): ${msg}` }, 400)
    }
    const gCampaignResource: string = campaignRes.data.results[0].resourceName
    const gCampaignId = gCampaignResource.split('/').pop()!

    // ── 3. Ad Group ────────────────────────────────────────────────
    const adGroupOp = {
      create: {
        name: `${campaign.campaign_name} – Ad Group`,
        status: 'PAUSED',
        campaign: gCampaignResource,
        type: 'SEARCH_STANDARD',
        cpcBidMicros: '1000000', // $1 default
      },
    }
    const adGroupRes = await adsMutate(ctx, '/adGroups:mutate', [adGroupOp])
    if (!adGroupRes.ok) {
      const msg = adGroupRes.data?.error?.message ?? JSON.stringify(adGroupRes.data).slice(0, 500)
      await admin.from('campaigns').update({
        google_campaign_id: gCampaignId,
        google_error: `AdGroup: ${msg}`,
      }).eq('id', campaign_id)
      return json({ error: `Google Ads API (AdGroup): ${msg}` }, 400)
    }
    const gAdGroupResource: string = adGroupRes.data.results[0].resourceName
    const gAdGroupId = gAdGroupResource.split('/').pop()!

    // ── 4. Responsive Search Ad ────────────────────────────────────
    // Build headlines/descriptions from campaign content
    const baseHeadlines = [
      campaign.headline,
      campaign.offer ?? campaign.headline,
      campaign.landing_page_title ?? campaign.headline,
    ].filter(Boolean).map(t => String(t).slice(0, 30))

    // RSA requires at least 3 headlines (max 30 chars) and 2 descriptions (max 90 chars)
    while (baseHeadlines.length < 3) baseHeadlines.push(`${campaign.campaign_name}`.slice(0, 30))

    const descriptions = [
      String(campaign.ad_copy).slice(0, 90),
      String(campaign.landing_page_body ?? campaign.offer ?? campaign.ad_copy).slice(0, 90),
    ]

    const adOp = {
      create: {
        adGroup: gAdGroupResource,
        status: 'PAUSED',
        ad: {
          finalUrls: [finalUrl],
          responsiveSearchAd: {
            headlines: baseHeadlines.slice(0, 15).map(text => ({ text })),
            descriptions: descriptions.slice(0, 4).map(text => ({ text })),
          },
        },
      },
    }
    const adRes = await adsMutate(ctx, '/adGroupAds:mutate', [adOp])
    if (!adRes.ok) {
      const msg = adRes.data?.error?.message ?? JSON.stringify(adRes.data).slice(0, 500)
      await admin.from('campaigns').update({
        google_campaign_id: gCampaignId,
        google_ad_group_id: gAdGroupId,
        google_error: `Ad: ${msg}`,
      }).eq('id', campaign_id)
      return json({ error: `Google Ads API (Ad): ${msg}` }, 400)
    }
    const gAdResource: string = adRes.data.results[0].resourceName
    const gAdId = gAdResource.split('~').pop()!

    // ── 5. Keywords (best-effort, fail-soft) ───────────────────────
    const keywords = (campaign.keywords as string[] | null) ?? []
    if (keywords.length > 0) {
      const kwOps = keywords.slice(0, 20).map(kw => ({
        create: {
          adGroup: gAdGroupResource,
          status: 'PAUSED',
          keyword: { text: kw, matchType: 'BROAD' },
        },
      }))
      await adsMutate(ctx, '/adGroupCriteria:mutate', kwOps)
      // ignore keyword errors — ad/campaign already created
    }

    // ── Save IDs back ──────────────────────────────────────────────
    await admin.from('campaigns').update({
      google_campaign_id: gCampaignId,
      google_ad_group_id: gAdGroupId,
      google_ad_id:       gAdId,
      google_error:       null,
      status:             'active',
      channels:           [...new Set([...((campaign.channels as string[]) ?? []), 'google'])],
      landing_page_url:   finalUrl,
    }).eq('id', campaign_id)

    return json({
      success: true,
      google_campaign_id: gCampaignId,
      google_ad_group_id: gAdGroupId,
      google_ad_id:       gAdId,
      message: 'Campaign created in Google Ads as PAUSED. Review and activate in Google Ads UI.',
    })
  } catch (err) {
    console.error(err)
    return json({ error: 'Internal server error' }, 500)
  }
})
