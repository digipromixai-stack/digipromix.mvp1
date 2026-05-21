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

function formatMetaError(err: MetaErrorBody | undefined): { msg: string; tokenExpired: boolean; pendingAction: boolean; detail: string } {
  if (!err) return { msg: 'Unknown Meta error', tokenExpired: false, pendingAction: false, detail: '' }
  const tokenExpired = err.code === 190 || err.code === 102 || err.code === 463
  // code 31 = "pending action required" — Meta has flagged the ad account
  // and requires the owner to verify it manually in Ads Manager. No code fix
  // can bypass this; only the account owner can resolve it.
  const pendingAction = err.code === 31 || err.error_subcode === 3858385
  // Prefer the user-friendly Meta-provided messages when available
  const userMsg = err.error_user_msg ?? err.error_user_title
  let msg: string
  if (tokenExpired) {
    msg = 'Meta access token expired. Please reconnect your Meta account in Settings.'
  } else if (pendingAction) {
    // Meta's own message (often translated for the account locale) is fine —
    // just prepend a one-line action so the user knows where to go.
    msg = `Verify your account in Meta Ads Manager to continue: ${userMsg ?? err.message ?? ''}`.trim()
  } else {
    msg = userMsg ?? err.message ?? 'Unknown Meta error'
  }
  const detail = [
    err.code        ? `code=${err.code}`              : null,
    err.error_subcode ? `subcode=${err.error_subcode}` : null,
    err.fbtrace_id  ? `trace=${err.fbtrace_id}`       : null,
    err.message     ? `raw="${err.message}"`           : null,
  ].filter(Boolean).join(' ')
  return { msg, tokenExpired, pendingAction, detail }
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

// Meta requires PNG / JPG / GIF (no SVG). Returns true for known-good formats.
function isMetaCompatibleImage(url: string): boolean {
  try {
    const u = new URL(url)
    // Reject anything that obviously won't decode
    if (/\.svg(\?|$)/i.test(u.pathname)) return false
    return true
  } catch { return false }
}

/**
 * HEAD-check that an image URL actually exists + returns a raster MIME type.
 * Prevents Meta from rejecting with subcode 1487833 ("could not be downloaded")
 * when the og:image points to a 404 or to a non-image resource.
 */
async function isImageReachable(url: string): Promise<boolean> {
  try {
    let res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    // Some servers don't support HEAD — fall back to a tiny GET
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    }
    if (!res.ok) return false
    const ct = res.headers.get('content-type') ?? ''
    // Accept anything that looks like an image (image/png, image/jpeg, image/gif, image/webp)
    return /^image\/(png|jpe?g|gif|webp)/i.test(ct)
  } catch { return false }
}

// Scrape og:image / twitter:image from the landing page so Meta has a real
// raster image to use for the ad. Falls back to null if nothing usable found.
async function scrapePageImage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'DigiPromix-Bot/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    // og:image, twitter:image, then first <img src>
    const patterns = [
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
      /<link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i,
    ]
    for (const re of patterns) {
      const m = html.match(re)
      if (m && m[1] && isMetaCompatibleImage(m[1])) {
        // Resolve relative URLs against the page URL
        try { return new URL(m[1], pageUrl).toString() } catch { /* ignore */ }
      }
    }
    return null
  } catch { return null }
}

// Default fallback image — a generic 1200×630 marketing graphic.
// Replace with your own hosted asset when you have one.
const DEFAULT_AD_IMAGE = 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200&h=630&fit=crop&auto=format&q=80'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const adminOnBehalfOf = req.headers.get('x-admin-on-behalf-of')

    // Admin path: bearer = service role + x-admin-on-behalf-of header set.
    // Bypasses user-session lookup so internal functions / cron / curl can launch.
    let user: { id: string } | null = null
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (adminOnBehalfOf && serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) {
      user = { id: adminOnBehalfOf }
    } else {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: { user: u }, error: authErr } = await userClient.auth.getUser()
      if (authErr || !u) return json({ error: 'Unauthorized' }, 401)
      user = u
    }

    // Service-role client for privileged DB operations
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const reqBody = await req.json().catch(() => ({}))
    const { campaign_id, daily_budget_usd, landing_page_url, image_url } = reqBody as {
      campaign_id?: string; daily_budget_usd?: number; landing_page_url?: string; image_url?: string
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
    // The Meta API treats this as the smallest currency unit (cents / paise).
    const budgetInput = Number(daily_budget_usd ?? campaign.daily_budget ?? 10)
    if (!Number.isFinite(budgetInput) || budgetInput < 1) {
      const msg = 'Daily budget must be at least 1 unit of the account currency.'
      await admin.from('campaigns').update({ meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, 400)
    }

    // Fetch ad account currency so we can give a currency-aware error if
    // Meta later rejects the budget. (The min_daily_budget_* fields were
    // removed from the public Ad Account endpoint in Meta API v19+.)
    const acctInfo = await metaGet(`/${accountId}?fields=currency`, token)
    if (acctInfo.error) {
      const { msg, tokenExpired, pendingAction, detail } = formatMetaError(acctInfo.error)
      console.error('Meta account info failed:', detail, acctInfo.error)
      if (tokenExpired) {
        await admin.from('ad_integrations').update({ is_active: false })
          .eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({ meta_error: `${msg} (${detail})`, status: 'failed' }).eq('id', campaign_id)
      return json({ error: msg, detail }, tokenExpired ? 401 : (pendingAction ? 409 : 400))
    }
    const currency: string = (acctInfo.currency as string) ?? 'USD'

    // Per-currency known minimum daily budgets (Meta Marketing API docs, 2024).
    // Used both for pre-flight validation and to enrich the post-flight error.
    // Values are in whole units of the currency.
    const CURRENCY_MIN_DAILY: Record<string, number> = {
      USD: 1,    EUR: 1,    GBP: 1,    CAD: 1,    AUD: 1,    NZD: 1,
      JPY: 100,  // JPY has no subunits
      INR: 40,   AED: 4,    SAR: 4,    EGP: 8,    QAR: 4,    KWD: 0.3,
      BRL: 3,    MXN: 20,   ARS: 100,
      ZAR: 15,   NGN: 400,
      TRY: 5,    RUB: 60,   IDR: 14000, MYR: 4, PHP: 50, THB: 30, VND: 23000,
      SGD: 2,    HKD: 8,    TWD: 30,
      CNY: 7,    KRW: 1200,
      CHF: 1,    SEK: 10,   NOK: 10,   DKK: 7,    PLN: 4,    CZK: 23,
    }
    const minDailyWhole = CURRENCY_MIN_DAILY[currency] ?? 1

    if (budgetInput < minDailyWhole) {
      const msg = `Daily budget too small for this ${currency} account. Meta requires at least ${minDailyWhole} ${currency}/day. Provided: ${budgetInput} ${currency}.`
      await admin.from('campaigns').update({ meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg, currency, min_daily: minDailyWhole }, 400)
    }

    // Meta expects budget in smallest currency unit (cents / paise / etc).
    // JPY/KRW/etc. have no subunits — pass the whole-unit amount directly.
    const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'IDR'])
    const dailyBudgetCents = ZERO_DECIMAL_CURRENCIES.has(currency)
      ? Math.round(budgetInput)
      : Math.round(budgetInput * 100)

    if (!campaign.campaign_name || !campaign.headline) {
      const msg = 'Campaign is missing a name or headline. Generate the campaign content first.'
      await admin.from('campaigns').update({ meta_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, 400)
    }

    // ── 1. Create Campaign with CBO (Campaign Budget Optimization) ───────
    // Meta requires either CBO (budget on campaign) OR is_adset_budget_sharing_enabled
    // explicitly set. We use CBO since it's Meta's recommended modern approach.
    // bid_strategy is set HERE (campaign level) — when CBO is on the campaign,
    // the AdSet inherits the strategy and you cannot also set it on the AdSet.
    const metaCampaign = await metaPost(`/${accountId}/campaigns`, token, {
      name:                              campaign.campaign_name,
      objective:                         'OUTCOME_TRAFFIC',
      status:                            'PAUSED',
      buying_type:                       'AUCTION',
      special_ad_categories:             [],
      daily_budget:                      dailyBudgetCents,     // CBO — budget at campaign level
      bid_strategy:                      'LOWEST_COST_WITHOUT_CAP', // Meta-managed, no bid_amount required
      is_adset_budget_sharing_enabled:   false,                // explicit per Meta requirement (code 4834011)
    })

    if (metaCampaign.error) {
      const { msg, tokenExpired, pendingAction, detail } = formatMetaError(metaCampaign.error)
      console.error('Meta campaign create failed:', detail, metaCampaign.error)
      // Meta's "budget too small" subcode — enrich with our known minimum
      let finalMsg = msg
      if (metaCampaign.error.error_subcode === 2446375) {
        finalMsg = `Daily budget too small. Try at least ${minDailyWhole * 5} ${currency}/day (your account currency is ${currency}).`
      }
      if (tokenExpired) {
        await admin.from('ad_integrations').update({ is_active: false })
          .eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({ meta_error: `${finalMsg} (${detail})`, status: 'failed' }).eq('id', campaign_id)
      return json({ error: finalMsg, detail, currency, min_daily: minDailyWhole }, tokenExpired ? 401 : (pendingAction ? 409 : 400))
    }

    const metaCampaignId = metaCampaign.id!

    // ── 2. Create Ad Set (LINK_CLICKS — drives traffic to landing page) ──
    // No daily_budget AND no bid_strategy here — both come from the campaign
    // when using CBO. Setting bid_strategy on the AdSet triggers Meta's
    // "bid_amount required" error (subcode 1815857).
    const adSet = await metaPost(`/${accountId}/adsets`, token, {
      name:              `${campaign.campaign_name} – AdSet`,
      campaign_id:       metaCampaignId,
      billing_event:     'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      destination_type:  'WEBSITE',
      targeting: {
        geo_locations: { countries: ['US'] },
        age_min: 18,
        age_max: 65,
      },
      status: 'PAUSED',
    })

    if (adSet.error) {
      const { msg, tokenExpired, pendingAction, detail } = formatMetaError(adSet.error)
      console.error('Meta adset create failed:', detail, adSet.error)
      if (tokenExpired) {
        await admin.from('ad_integrations').update({ is_active: false })
          .eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({
        meta_campaign_id: metaCampaignId,
        meta_error:       `${msg} (${detail})`,
        status:           'failed',
      }).eq('id', campaign_id)
      return json({ error: msg, detail }, tokenExpired ? 401 : (pendingAction ? 409 : 400))
    }

    const adSetId = adSet.id!

    // ── 3. Resolve the ad image ──────────────────────────────────────────
    // Priority: explicit image_url param → og:image on landing page → default.
    // HEAD-check every candidate to avoid Meta subcode 1487833 ("image could
    // not be downloaded") when the og:image URL points to a 404.
    async function pickImage(): Promise<string> {
      if (image_url && isValidHttpUrl(image_url) && isMetaCompatibleImage(image_url)) {
        if (await isImageReachable(image_url.trim())) return image_url.trim()
      }
      const scraped = await scrapePageImage(adUrl)
      if (scraped && await isImageReachable(scraped)) return scraped
      // Last-resort default. If even this fails, Meta will surface the error.
      return DEFAULT_AD_IMAGE
    }
    const resolvedImage = await pickImage()

    // ── 4. Create Ad Creative ────────────────────────────────────────────
    // Note: degrees_of_freedom_spec.standard_enhancements was deprecated by
    // Meta (subcode 3858504). Individual features can be opted into per
    // https://fburl.com/hyth50xo — but they're optional, so we omit them.
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
          picture:     resolvedImage,    // explicit image so Meta doesn't try to auto-scrape SVG/missing
          call_to_action: { type: 'LEARN_MORE', value: { link: adUrl } },
        },
      },
    })

    if (creative.error) {
      const { msg, tokenExpired, pendingAction, detail } = formatMetaError(creative.error)
      console.error('Meta creative create failed:', detail, creative.error)
      // 2446496 = image processing failed (wrong format, too small)
      // 1487833 = image could not be downloaded (404, blocked, slow)
      let finalMsg = msg
      if (creative.error.error_subcode === 2446496 || creative.error.error_subcode === 1487833) {
        finalMsg = `Meta could not download or process the ad image (${resolvedImage}). Upload a public PNG/JPG at least 600×600px to your domain (e.g. /og-image.png) or pass image_url explicitly in the launch request.`
      }
      if (tokenExpired) {
        await admin.from('ad_integrations').update({ is_active: false })
          .eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({
        meta_campaign_id: metaCampaignId,
        meta_adset_id:    adSetId,
        meta_error:       `${finalMsg} (${detail})`,
        status:           'failed',
      }).eq('id', campaign_id)
      return json({ error: finalMsg, detail, image_used: resolvedImage }, tokenExpired ? 401 : (pendingAction ? 409 : 400))
    }

    // ── 4. Create Ad ─────────────────────────────────────────────────────
    const ad = await metaPost(`/${accountId}/ads`, token, {
      name:      campaign.campaign_name,
      adset_id:  adSetId,
      creative:  { creative_id: creative.id },
      status:    'PAUSED',
    })

    if (ad.error) {
      const { msg, tokenExpired, pendingAction, detail } = formatMetaError(ad.error)
      console.error('Meta ad create failed:', detail, ad.error)
      if (tokenExpired) {
        await admin.from('ad_integrations').update({ is_active: false })
          .eq('user_id', user.id).eq('platform', 'meta')
      }
      await admin.from('campaigns').update({
        meta_campaign_id: metaCampaignId,
        meta_adset_id:    adSetId,
        meta_error:       `${msg} (${detail})`,
        status:           'failed',
      }).eq('id', campaign_id)
      return json({ error: msg, detail }, tokenExpired ? 401 : (pendingAction ? 409 : 400))
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
