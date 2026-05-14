/**
 * launch-meta-campaign Edge Function v2 — SELF + MANAGED
 *
 * POST { campaign_id, daily_budget_usd?, landing_page_url? }
 *
 * SELF mode  → uses the user's OAuth-connected Meta ad account.
 * MANAGED mode → runs the campaign from DigiPromix's agency Business Manager
 *                using a long-lived System User token.
 *                Requires META_AGENCY_AD_ACCOUNT_ID, META_AGENCY_PAGE_ID and
 *                META_SYSTEM_USER_TOKEN to be configured.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const GRAPH = 'https://graph.facebook.com/v19.0'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function metaPost(path: string, token: string, payload: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  return res.json()
}

function metaError(err: { code?: number; message?: string }): { msg: string; tokenExpired: boolean } {
  const tokenExpired = err.code === 190 || err.code === 102
  const msg = tokenExpired
    ? 'Meta access token expired. Please reconnect your Meta account in Settings.'
    : (err.message ?? 'Unknown Meta error')
  return { msg, tokenExpired }
}

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
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .single()
    if (campErr || !campaign) return json({ error: 'Campaign not found' }, 404)

    const launchMode = (campaign.launch_mode as 'self' | 'managed' | null) ?? 'self'

    // ─── Resolve operating context based on launch mode ────────────────────────
    let token: string
    let accountId: string         // act_xxx
    let pageId: string

    if (launchMode === 'managed') {
      // MANAGED — reuse the existing OAuth pattern: the SaaS operator connects
      // their Business Manager-owned Meta ad account via meta-oauth and flags
      // the integration row with is_agency_manager = true. We use that row's
      // access_token + account_id + page_id for all managed launches.
      const { data: agency } = await admin
        .from('ad_integrations')
        .select('*')
        .eq('platform', 'meta')
        .eq('is_agency_manager', true)
        .eq('is_active', true)
        .maybeSingle()

      if (!agency || !agency.access_token || !agency.account_id || !agency.page_id) {
        const msg = 'Managed mode not configured — connect your agency Meta Business account via Settings and mark it as the agency-manager integration (is_agency_manager = true on ad_integrations).'
        await admin.from('campaigns').update({
          meta_error: msg, managed_provision_status: 'failed',
        }).eq('id', campaign_id)
        return json({ error: msg, code: 'managed_not_configured' }, 503)
      }

      const agencyAcct = agency.account_id as string
      const normalizedAcct = agencyAcct.startsWith('act_') ? agencyAcct : `act_${agencyAcct}`

      // Track that this user is using the agency-managed ad account
      await admin.from('managed_ads_accounts').upsert({
        user_id: user.id,
        platform: 'meta',
        external_account_id: normalizedAcct,
        business_name: (campaign.managed_business_name as string | null) ?? campaign.competitor_name ?? 'DigiPromix Client',
        currency_code: 'USD',
        timezone: 'America/New_York',
        billing_status: 'active',  // agency BM ad account already has billing
        notes: 'Shared agency ad account (Business Manager).',
      }, { onConflict: 'user_id,platform' })

      await admin.from('campaigns').update({ managed_provision_status: 'active' }).eq('id', campaign_id)

      token     = agency.access_token as string
      accountId = normalizedAcct
      pageId    = agency.page_id as string
    } else {
      // SELF — existing OAuth-connected user account flow
      const { data: integration, error: intErr } = await admin
        .from('ad_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .single()
      if (intErr || !integration) return json({ error: 'Meta account not connected. Connect in Settings or switch this campaign to managed mode.' }, 400)

      token     = integration.access_token as string
      accountId = integration.account_id as string
      const pid = integration.page_id as string | null
      if (!pid) return json({ error: 'No Facebook Page connected. Please reconnect your Meta account and select a page.' }, 400)
      pageId    = pid
    }

    const adUrl = landing_page_url ?? campaign.landing_page_url ?? 'https://example.com'

    // ── 1. Create Campaign ─────────────────────────────────────────
    const metaCampaign = await metaPost(`/${accountId}/campaigns`, token, {
      name: launchMode === 'managed'
        ? `[DigiPromix·${(user.email ?? user.id).slice(0, 12)}] ${campaign.campaign_name}`  // tag for tracking in shared agency account
        : campaign.campaign_name,
      objective: 'OUTCOME_LEADS',
      status: 'PAUSED',
      special_ad_categories: [],
    })

    if (metaCampaign.error) {
      const { msg, tokenExpired } = metaError(metaCampaign.error)
      if (tokenExpired && launchMode === 'self') {
        await admin.from('ad_integrations').update({ is_active: false }).eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({ meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, tokenExpired ? 401 : 400)
    }

    const metaCampaignId: string = metaCampaign.id

    // ── 2. Create Ad Set ───────────────────────────────────────────
    const adSet = await metaPost(`/${accountId}/adsets`, token, {
      name: `${campaign.campaign_name} – AdSet`,
      campaign_id: metaCampaignId,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LEAD_GENERATION',
      daily_budget: daily_budget_usd * 100,
      targeting: { geo_locations: { countries: ['US'] }, age_min: 18, age_max: 65 },
      status: 'PAUSED',
    })

    if (adSet.error) {
      const { msg, tokenExpired } = metaError(adSet.error)
      if (tokenExpired && launchMode === 'self') {
        await admin.from('ad_integrations').update({ is_active: false }).eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({ meta_campaign_id: metaCampaignId, meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, tokenExpired ? 401 : 400)
    }

    const adSetId: string = adSet.id

    // ── 3. Create Ad Creative ──────────────────────────────────────
    const creative = await metaPost(`/${accountId}/adcreatives`, token, {
      name: `${campaign.campaign_name} – Creative`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          message: campaign.social_copy ?? campaign.ad_copy,
          link: adUrl,
          name: campaign.headline,
          description: campaign.offer ?? campaign.ad_copy,
          call_to_action: { type: 'LEARN_MORE', value: { link: adUrl } },
        },
      },
    })

    if (creative.error) {
      const { msg, tokenExpired } = metaError(creative.error)
      if (tokenExpired && launchMode === 'self') {
        await admin.from('ad_integrations').update({ is_active: false }).eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({ meta_campaign_id: metaCampaignId, meta_adset_id: adSetId, meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, tokenExpired ? 401 : 400)
    }

    // ── 4. Create Ad ───────────────────────────────────────────────
    const ad = await metaPost(`/${accountId}/ads`, token, {
      name: campaign.campaign_name,
      adset_id: adSetId,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    })

    if (ad.error) {
      const { msg, tokenExpired } = metaError(ad.error)
      if (tokenExpired && launchMode === 'self') {
        await admin.from('ad_integrations').update({ is_active: false }).eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({ meta_campaign_id: metaCampaignId, meta_adset_id: adSetId, meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, tokenExpired ? 401 : 400)
    }

    // ── Save IDs back to our DB ────────────────────────────────────
    await admin.from('campaigns').update({
      meta_campaign_id: metaCampaignId,
      meta_adset_id:    adSetId,
      meta_ad_id:       ad.id,
      meta_error:       null,
      status:           launchMode === 'managed' ? 'draft' : 'active',
      channels:         [...new Set([...((campaign.channels as string[]) ?? []), 'meta'])],
      landing_page_url: adUrl,
    }).eq('id', campaign_id)

    return json({
      success: true,
      mode: launchMode,
      managed_account_id: launchMode === 'managed' ? accountId : null,
      meta_campaign_id: metaCampaignId,
      meta_adset_id:    adSetId,
      meta_ad_id:       ad.id,
      message: launchMode === 'managed'
        ? 'Campaign created in the DigiPromix-managed Meta ad account (PAUSED). Our team will review and activate within 24 hours.'
        : 'Campaign created on Meta as PAUSED. Review and activate in Meta Ads Manager.',
    })
  } catch (err) {
    console.error(err)
    return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
  }
})
