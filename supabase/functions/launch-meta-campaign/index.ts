/**
 * launch-meta-campaign Edge Function
 *
 * POST { campaign_id, daily_budget_usd?, landing_page_url? }
 *
 * Creates a full Meta Ads funnel (Campaign → AdSet → Creative → Ad) using the
 * user's connected Meta ad account. All objects are created with status=PAUSED
 * so the user can review before going live.
 *
 * Uses OUTCOME_TRAFFIC + LINK_CLICKS optimization which is the most permissive
 * launch path and avoids the lead-form setup required by OUTCOME_LEADS.
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

// ── Meta error helpers ──────────────────────────────────────────────────────
interface MetaErrorBody {
  message?:        string
  type?:           string
  code?:           number
  error_subcode?:  number
  error_user_title?: string
  error_user_msg?:   string
  fbtrace_id?:     string
}

function formatMetaError(err: MetaErrorBody | undefined): { msg: string; tokenExpired: boolean; detail: string } {
  if (!err) return { msg: 'Unknown Meta error', tokenExpired: false, detail: '' }
  const tokenExpired = err.code === 190 || err.code === 102 || err.code === 463
  // Prefer the user-friendly Meta-provided messages when available
  const userMsg = err.error_user_msg ?? err.error_user_title
  const msg = tokenExpired
    ? 'Meta access token expired. Please reconnect your Meta account in Settings.'
    : userMsg ?? err.message ?? 'Unknown Meta error'
  const detail = [
    err.code        ? `code=${err.code}`              : null,
    err.error_subcode ? `subcode=${err.error_subcode}` : null,
    err.fbtrace_id  ? `trace=${err.fbtrace_id}`       : null,
    err.message     ? `raw="${err.message}"`           : null,
  ].filter(Boolean).join(' ')
  return { msg, tokenExpired, detail }
}

async function metaPost(path: string, token: string, payload: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  return body as Record<string, unknown> & { error?: MetaErrorBody; id?: string }
}

async function metaGet(path: string, token: string) {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json().catch(() => ({}))
  return body as Record<string, unknown> & { error?: MetaErrorBody }
}

// ── Validation ──────────────────────────────────────────────────────────────
function isValidHttpUrl(s: unknown): s is string {
  if (typeof s !== 'string' || !s.trim()) return false
  try {
    const u = new URL(s.trim())
    return (u.protocol === 'http:' || u.protocol === 'https:') &&
           !/example\.com$/i.test(u.hostname)
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''

    // Authenticate via user-scoped client
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

    const reqBody = await req.json().catch(() => ({}))
    const { campaign_id, daily_budget_usd, landing_page_url } = reqBody as {
      campaign_id?: string; daily_budget_usd?: number; landing_page_url?: string
    }
    if (!campaign_id) return json({ error: 'campaign_id required' }, 400)

    // Fetch our campaign
    const { data: campaign, error: campErr } = await admin
      .from('campaigns').select('*').eq('id', campaign_id).eq('user_id', user.id).single()
    if (campErr || !campaign) return json({ error: 'Campaign not found' }, 404)

    // Fetch Meta integration
    const { data: integration, error: intErr } = await admin
      .from('ad_integrations').select('*')
      .eq('user_id', user.id).eq('platform', 'meta').eq('is_active', true).single()
    if (intErr || !integration) {
      return json({ error: 'Meta account not connected. Please connect your Meta account in Settings.' }, 400)
    }

    const token     = integration.access_token as string
    const accountId = integration.account_id as string   // e.g. act_355298871
    const pageId    = integration.page_id as string | null

    if (!pageId) {
      return json({ error: 'No Facebook Page connected. Please reconnect your Meta account and select a Page.' }, 400)
    }

    // ── Validate inputs before hitting Meta ──────────────────────────────
    const adUrlRaw = landing_page_url ?? campaign.landing_page_url
    if (!isValidHttpUrl(adUrlRaw)) {
      const msg = 'Landing page URL is missing or invalid. Set a real https:// URL on the campaign before launching.'
      await admin.from('campaigns').update({ meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, 400)
    }
    const adUrl = (adUrlRaw as string).trim()

    // Daily budget — user provides amount in account currency (not always USD).
    // We still accept the `daily_budget_usd` request param for backward compat.
    const budgetInput = Number(daily_budget_usd ?? campaign.daily_budget ?? 10)
    if (!Number.isFinite(budgetInput) || budgetInput < 1) {
      const msg = 'Daily budget must be at least 1 unit of the account currency.'
      await admin.from('campaigns').update({ meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, 400)
    }

    // Fetch ad account currency + minimum daily budget from Meta so we can give
    // the user a precise error rather than the opaque "budget too small".
    const acctInfo = await metaGet(
      `/${accountId}?fields=currency,min_daily_budget_low_freq,min_daily_budget_imp`,
      token,
    )
    if (acctInfo.error) {
      const { msg, tokenExpired, detail } = formatMetaError(acctInfo.error)
      console.error('Meta account info failed:', detail, acctInfo.error)
      if (tokenExpired) {
        await admin.from('ad_integrations').update({ is_active: false })
          .eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({ meta_error: `${msg} (${detail})` }).eq('id', campaign_id)
      return json({ error: msg, detail }, tokenExpired ? 401 : 400)
    }
    const currency: string = (acctInfo.currency as string) ?? 'USD'
    // min_daily_budget_low_freq is in the smallest currency unit (cents/paise/etc.)
    const accountMinSmallest = Number(acctInfo.min_daily_budget_low_freq ?? 100)

    // Convert user's input. Their input is in *whole units* of the account
    // currency (e.g. 10 = ₹10 / $10 / €10). We multiply by 100 to get the
    // smallest unit Meta expects.
    let dailyBudgetCents = Math.round(budgetInput * 100)

    // If below account minimum, bump up to the minimum and let the user know
    if (dailyBudgetCents < accountMinSmallest) {
      const minWhole = (accountMinSmallest / 100).toFixed(2)
      const msg = `Daily budget too small for this ${currency} account. Meta requires at least ${minWhole} ${currency}/day. Provided: ${budgetInput} ${currency}.`
      await admin.from('campaigns').update({ meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg, currency, min_daily: Number(minWhole) }, 400)
    }

    if (!campaign.campaign_name || !campaign.headline) {
      const msg = 'Campaign is missing a name or headline. Generate the campaign content first.'
      await admin.from('campaigns').update({ meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, 400)
    }

    // ── 1. Create Campaign with CBO (Campaign Budget Optimization) ───────
    // Meta requires either CBO (budget on campaign) OR is_adset_budget_sharing_enabled
    // explicitly set. We use CBO since it's Meta's recommended modern approach.
    const metaCampaign = await metaPost(`/${accountId}/campaigns`, token, {
      name:                              campaign.campaign_name,
      objective:                         'OUTCOME_TRAFFIC',
      status:                            'PAUSED',
      buying_type:                       'AUCTION',
      special_ad_categories:             [],
      daily_budget:                      dailyBudgetCents,     // CBO — budget at campaign level
      is_adset_budget_sharing_enabled:   false,                // explicit per Meta requirement (code 4834011)
    })

    if (metaCampaign.error) {
      const { msg, tokenExpired, detail } = formatMetaError(metaCampaign.error)
      console.error('Meta campaign create failed:', detail, metaCampaign.error)
      if (tokenExpired) {
        await admin.from('ad_integrations').update({ is_active: false })
          .eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({ meta_error: `${msg} (${detail})` }).eq('id', campaign_id)
      return json({ error: msg, detail }, tokenExpired ? 401 : 400)
    }

    const metaCampaignId = metaCampaign.id!

    // ── 2. Create Ad Set (LINK_CLICKS — drives traffic to landing page) ──
    // No daily_budget here — using campaign-level CBO instead.
    const adSet = await metaPost(`/${accountId}/adsets`, token, {
      name:              `${campaign.campaign_name} – AdSet`,
      campaign_id:       metaCampaignId,
      billing_event:     'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      destination_type:  'WEBSITE',
      bid_strategy:      'LOWEST_COST_WITHOUT_CAP',
      targeting: {
        geo_locations: { countries: ['US'] },
        age_min: 18,
        age_max: 65,
      },
      status: 'PAUSED',
    })

    if (adSet.error) {
      const { msg, tokenExpired, detail } = formatMetaError(adSet.error)
      console.error('Meta adset create failed:', detail, adSet.error)
      if (tokenExpired) {
        await admin.from('ad_integrations').update({ is_active: false })
          .eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({
        meta_campaign_id: metaCampaignId,
        meta_error:       `${msg} (${detail})`,
      }).eq('id', campaign_id)
      return json({ error: msg, detail }, tokenExpired ? 401 : 400)
    }

    const adSetId = adSet.id!

    // ── 3. Create Ad Creative ────────────────────────────────────────────
    const message = (campaign.social_copy ?? campaign.ad_copy ?? campaign.headline) as string
    const creative = await metaPost(`/${accountId}/adcreatives`, token, {
      name: `${campaign.campaign_name} – Creative`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          message,
          link:        adUrl,
          name:        campaign.headline,
          description: campaign.offer ?? campaign.ad_copy ?? '',
          call_to_action: { type: 'LEARN_MORE', value: { link: adUrl } },
        },
      },
      degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } } },
    })

    if (creative.error) {
      const { msg, tokenExpired, detail } = formatMetaError(creative.error)
      console.error('Meta creative create failed:', detail, creative.error)
      if (tokenExpired) {
        await admin.from('ad_integrations').update({ is_active: false })
          .eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({
        meta_campaign_id: metaCampaignId,
        meta_adset_id:    adSetId,
        meta_error:       `${msg} (${detail})`,
      }).eq('id', campaign_id)
      return json({ error: msg, detail }, tokenExpired ? 401 : 400)
    }

    // ── 4. Create Ad ─────────────────────────────────────────────────────
    const ad = await metaPost(`/${accountId}/ads`, token, {
      name:      campaign.campaign_name,
      adset_id:  adSetId,
      creative:  { creative_id: creative.id },
      status:    'PAUSED',
    })

    if (ad.error) {
      const { msg, tokenExpired, detail } = formatMetaError(ad.error)
      console.error('Meta ad create failed:', detail, ad.error)
      if (tokenExpired) {
        await admin.from('ad_integrations').update({ is_active: false })
          .eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({
        meta_campaign_id: metaCampaignId,
        meta_adset_id:    adSetId,
        meta_error:       `${msg} (${detail})`,
      }).eq('id', campaign_id)
      return json({ error: msg, detail }, tokenExpired ? 401 : 400)
    }

    // ── Save IDs back to our DB ──────────────────────────────────────────
    await admin.from('campaigns').update({
      meta_campaign_id: metaCampaignId,
      meta_adset_id:    adSetId,
      meta_ad_id:       ad.id,
      meta_error:       null,
      status:           'active',
      channels:         [...new Set([...((campaign.channels as string[]) ?? []), 'meta'])],
      landing_page_url: adUrl,
      daily_budget:     budgetUsd,
    }).eq('id', campaign_id)

    return json({
      success:          true,
      meta_campaign_id: metaCampaignId,
      meta_adset_id:    adSetId,
      meta_ad_id:       ad.id,
      message:          'Campaign created on Meta as PAUSED. Review and activate in Meta Ads Manager.',
    })
  } catch (err) {
    console.error('launch-meta-campaign error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
