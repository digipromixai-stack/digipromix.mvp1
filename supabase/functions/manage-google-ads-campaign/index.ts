/**
 * manage-google-ads-campaign Edge Function
 *
 * POST { campaign_id, action }
 * action: "pause" | "enable" | "delete"
 *
 * Syncs the action to Google Ads REST API v20 for the campaign,
 * ad group, and ad associated with the campaign.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { GOOGLE_ADS_API as ADS_API } from '../_shared/config.ts'

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
  return res.json() as Promise<{ access_token?: string; expires_in?: number; error?: string }>
}

interface AdsCtx {
  customerId: string
  loginCustomerId: string
  accessToken: string
  devToken: string
}

async function adsMutate(ctx: AdsCtx, path: string, operations: unknown[]) {
  const res = await fetch(`${ADS_API}/customers/${ctx.customerId}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      'developer-token': ctx.devToken,
      'login-customer-id': ctx.loginCustomerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ operations }),
  })
  const data = await res.json()
  return { ok: res.ok, data }
}

async function adsDelete(ctx: AdsCtx, resourceName: string, path: string) {
  const res = await fetch(`${ADS_API}/customers/${ctx.customerId}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      'developer-token': ctx.devToken,
      'login-customer-id': ctx.loginCustomerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ operations: [{ remove: resourceName }] }),
  })
  const data = await res.json()
  return { ok: res.ok, data }
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

    const { campaign_id, action } = await req.json()
    if (!campaign_id) return json({ error: 'campaign_id required' }, 400)
    if (!['pause', 'enable', 'delete'].includes(action)) {
      return json({ error: 'action must be one of: pause, enable, delete' }, 400)
    }

    // Fetch campaign from DB
    const { data: campaign, error: campErr } = await admin
      .from('campaigns').select('*')
      .eq('id', campaign_id).eq('user_id', user.id).single()
    if (campErr || !campaign) return json({ error: 'Campaign not found' }, 404)

    const gCampaignId   = campaign.google_campaign_id as string | null
    const gAdGroupId    = campaign.google_ad_group_id as string | null
    const gAdId         = campaign.google_ad_id as string | null

    // If no Google Ads IDs, just update DB status and return
    if (!gCampaignId) {
      const dbStatus = action === 'pause' ? 'paused' : action === 'enable' ? 'active' : null
      if (action === 'delete') {
        await admin.from('campaigns').delete().eq('id', campaign_id)
        return json({ success: true, message: 'Campaign deleted (no Google Ads campaign linked)' })
      }
      await admin.from('campaigns').update({ status: dbStatus }).eq('id', campaign_id)
      return json({ success: true, message: `Campaign ${action}d (no Google Ads campaign linked)` })
    }

    // Fetch Google integration
    const { data: integration, error: intErr } = await admin
      .from('ad_integrations').select('*')
      .eq('user_id', user.id).eq('platform', 'google').eq('is_active', true).single()
    if (intErr || !integration) return json({ error: 'Google Ads account not connected' }, 400)

    const clientId     = await getSecret(admin, 'GOOGLE_ADS_CLIENT_ID', 'google_ads_client_id')
    const clientSecret = await getSecret(admin, 'GOOGLE_ADS_CLIENT_SECRET', 'google_ads_client_secret')
    const devToken     = await getSecret(admin, 'GOOGLE_ADS_DEVELOPER_TOKEN', 'google_ads_developer_token')
    if (!clientId || !clientSecret || !devToken) {
      return json({ error: 'Google Ads API credentials not configured' }, 500)
    }

    // Refresh token
    let accessToken = integration.access_token as string
    const refreshToken = integration.refresh_token as string | null
    if (refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken, clientId, clientSecret)
      if (refreshed.error) {
        await admin.from('ad_integrations').update({ is_active: false }).eq('id', integration.id)
        return json({ error: 'Google Ads token expired or revoked. Please reconnect in Settings.' }, 401)
      }
      if (refreshed.access_token) {
        accessToken = refreshed.access_token
        await admin.from('ad_integrations').update({
          access_token: accessToken,
          token_expires_at: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(),
        }).eq('id', integration.id)
      }
    }

    const customerId = (integration.account_id as string).replace(/-/g, '')
    // Only set login-customer-id when accessing through an MCC (non-empty + different from customerId).
    const rawLoginId = (integration.login_customer_id as string | null)?.replace(/-/g, '') ?? null
    const loginCustomerId = rawLoginId && rawLoginId !== customerId ? rawLoginId : customerId
    const ctx: AdsCtx = { customerId, loginCustomerId, accessToken, devToken }

    const errors: string[] = []

    // ── DELETE ──────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      // Delete in reverse order: Ad → Ad Group → Campaign
      if (gAdId && gAdGroupId) {
        const adRN = `customers/${customerId}/adGroupAds/${gAdGroupId}~${gAdId}`
        const r = await adsDelete(ctx, adRN, '/adGroupAds:mutate')
        if (!r.ok) errors.push(`Ad delete: ${JSON.stringify(r.data).slice(0, 200)}`)
      }
      if (gAdGroupId) {
        const agRN = `customers/${customerId}/adGroups/${gAdGroupId}`
        const r = await adsDelete(ctx, agRN, '/adGroups:mutate')
        if (!r.ok) errors.push(`AdGroup delete: ${JSON.stringify(r.data).slice(0, 200)}`)
      }
      if (gCampaignId) {
        const cRN = `customers/${customerId}/campaigns/${gCampaignId}`
        const r = await adsDelete(ctx, cRN, '/campaigns:mutate')
        if (!r.ok) errors.push(`Campaign delete: ${JSON.stringify(r.data).slice(0, 200)}`)
      }

      // Delete from DB regardless (best-effort Google delete)
      await admin.from('campaigns').delete().eq('id', campaign_id)

      if (errors.length > 0) {
        return json({ success: true, warnings: errors, message: 'Campaign deleted from app. Some Google Ads objects may need manual removal.' })
      }
      return json({ success: true, message: 'Campaign deleted from Google Ads and app.' })
    }

    // ── PAUSE / ENABLE ───────────────────────────────────────────────────────────
    const gStatus = action === 'pause' ? 'PAUSED' : 'ENABLED'
    const dbStatus = action === 'pause' ? 'paused' : 'active'

    // Update Campaign status
    const campaignRes = await adsMutate(ctx, '/campaigns:mutate', [{
      update: {
        resourceName: `customers/${customerId}/campaigns/${gCampaignId}`,
        status: gStatus,
      },
      updateMask: 'status',
    }])
    if (!campaignRes.ok) errors.push(`Campaign: ${JSON.stringify(campaignRes.data).slice(0, 200)}`)

    // Update Ad Group status
    if (gAdGroupId) {
      const adGroupRes = await adsMutate(ctx, '/adGroups:mutate', [{
        update: {
          resourceName: `customers/${customerId}/adGroups/${gAdGroupId}`,
          status: gStatus,
        },
        updateMask: 'status',
      }])
      if (!adGroupRes.ok) errors.push(`AdGroup: ${JSON.stringify(adGroupRes.data).slice(0, 200)}`)
    }

    // Update Ad status
    if (gAdGroupId && gAdId) {
      const adRes = await adsMutate(ctx, '/adGroupAds:mutate', [{
        update: {
          resourceName: `customers/${customerId}/adGroupAds/${gAdGroupId}~${gAdId}`,
          status: gStatus,
        },
        updateMask: 'status',
      }])
      if (!adRes.ok) errors.push(`Ad: ${JSON.stringify(adRes.data).slice(0, 200)}`)
    }

    if (errors.length > 0) {
      // Do NOT update DB — keep it in sync with actual Google Ads state
      return json({ success: false, errors, message: 'Google Ads update failed — status unchanged.' }, 400)
    }

    // Only update DB after all Google Ads calls succeed
    await admin.from('campaigns').update({ status: dbStatus }).eq('id', campaign_id)

    return json({
      success: true,
      message: `Campaign ${action === 'pause' ? 'paused' : 'enabled'} in Google Ads and app.`,
    })

  } catch (err) {
    console.error(err)
    return json({ error: 'Internal server error' }, 500)
  }
})
