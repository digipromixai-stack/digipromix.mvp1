/**
 * launch-meta-campaign Edge Function
 *
 * POST { campaign_id, daily_budget_usd?, landing_page_url? }
 *
 * Creates a full Meta Ads campaign (Campaign → AdSet → Creative → Ad)
 * using the user's connected Meta ad account.
 * All objects are created with status=PAUSED so user can review before going live.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  const params = new URLSearchParams({ access_token: token })
  const res = await fetch(`${GRAPH}${path}?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''

    // Authenticate via user-scoped client (passes JWT to Auth API)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    // Service-role client for privileged DB operations
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const { campaign_id, daily_budget_usd = 10, landing_page_url } = await req.json()
    if (!campaign_id) return json({ error: 'campaign_id required' }, 400)

    // Fetch our campaign
    const { data: campaign, error: campErr } = await admin
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .single()

    if (campErr || !campaign) return json({ error: 'Campaign not found' }, 404)

    // Fetch Meta integration
    const { data: integration, error: intErr } = await admin
      .from('ad_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('platform', 'meta')
      .eq('is_active', true)
      .single()

    if (intErr || !integration) return json({ error: 'Meta account not connected. Please connect your Meta account in Settings.' }, 400)

    const token     = integration.access_token as string
    const accountId = integration.account_id as string   // e.g. act_123456789
    const pageId    = integration.page_id as string | null

    if (!pageId) return json({ error: 'No Facebook Page connected. Please reconnect your Meta account and select a page.' }, 400)

    const adUrl = landing_page_url ?? campaign.landing_page_url ?? 'https://example.com'

    // ── 1. Create Campaign ─────────────────────────────────────────
    const metaCampaign = await metaPost(`/${accountId}/campaigns`, token, {
      name: campaign.campaign_name,
      objective: 'OUTCOME_LEADS',
      status: 'PAUSED',
      special_ad_categories: [],
    })

    if (metaCampaign.error) {
      await admin.from('campaigns').update({ meta_error: metaCampaign.error.message }).eq('id', campaign_id)
      return json({ error: `Meta API: ${metaCampaign.error.message}` }, 400)
    }

    const metaCampaignId: string = metaCampaign.id

    // ── 2. Create Ad Set ───────────────────────────────────────────
    const adSet = await metaPost(`/${accountId}/adsets`, token, {
      name: `${campaign.campaign_name} – AdSet`,
      campaign_id: metaCampaignId,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LEAD_GENERATION',
      daily_budget: daily_budget_usd * 100,    // cents
      targeting: {
        geo_locations: { countries: ['US'] },  // user can edit in Meta Ads Manager
        age_min: 18,
        age_max: 65,
      },
      status: 'PAUSED',
    })

    if (adSet.error) {
      await admin.from('campaigns').update({ meta_campaign_id: metaCampaignId, meta_error: adSet.error.message }).eq('id', campaign_id)
      return json({ error: `Meta API (AdSet): ${adSet.error.message}` }, 400)
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
          call_to_action: {
            type: 'LEARN_MORE',
            value: { link: adUrl },
          },
        },
      },
    })

    if (creative.error) {
      await admin.from('campaigns').update({
        meta_campaign_id: metaCampaignId,
        meta_adset_id: adSetId,
        meta_error: creative.error.message,
      }).eq('id', campaign_id)
      return json({ error: `Meta API (Creative): ${creative.error.message}` }, 400)
    }

    // ── 4. Create Ad ───────────────────────────────────────────────
    const ad = await metaPost(`/${accountId}/ads`, token, {
      name: campaign.campaign_name,
      adset_id: adSetId,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    })

    if (ad.error) {
      await admin.from('campaigns').update({
        meta_campaign_id: metaCampaignId,
        meta_adset_id: adSetId,
        meta_error: ad.error.message,
      }).eq('id', campaign_id)
      return json({ error: `Meta API (Ad): ${ad.error.message}` }, 400)
    }

    // ── Save IDs back to our DB ────────────────────────────────────
    await admin.from('campaigns').update({
      meta_campaign_id: metaCampaignId,
      meta_adset_id:    adSetId,
      meta_ad_id:       ad.id,
      meta_error:       null,
      status:           'active',
      channels:         [...new Set([...((campaign.channels as string[]) ?? []), 'meta'])],
      landing_page_url: adUrl,
    }).eq('id', campaign_id)

    return json({
      success: true,
      meta_campaign_id: metaCampaignId,
      meta_adset_id:    adSetId,
      meta_ad_id:       ad.id,
      message:          'Campaign created on Meta as PAUSED. Review and activate in Meta Ads Manager.',
    })
  } catch (err) {
    console.error(err)
    return json({ error: 'Internal server error' }, 500)
  }
})
