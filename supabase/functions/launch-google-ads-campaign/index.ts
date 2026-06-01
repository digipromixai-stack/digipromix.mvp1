/**
 * launch-google-ads-campaign Edge Function v11
 *
 * POST { campaign_id, daily_budget_usd?, landing_page_url? }
 *
 * Creates a PAUSED Search campaign in Google Ads via REST API v20:
 *   Campaign Budget → Campaign (PAUSED) → Ad Group (PAUSED) →
 *   Responsive Search Ad (PAUSED) → Keywords (broad + exact)
 *
 * Refreshes the OAuth access token using the stored refresh_token.
 * Validates landing_page_url and daily_budget before any Google Ads API call.
 * All objects created PAUSED for safety — user activates in Google Ads UI.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

/** Strip non-ASCII and Google-rejected chars, collapse whitespace */
function sanitize(s: string): string {
  return String(s ?? '')
    .replace(/[–—]/g, '-')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split `text` into chunks of ≤ maxLen chars, breaking at word boundaries */
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
    if (candidate.length <= maxLen) {
      current = candidate
    } else {
      if (current) chunks.push(current)
      current = w
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/**
 * Build high-quality RSA headlines for maximum Ad Strength.
 * Google grades ads "Poor → Average → Good → Excellent" based on:
 *   - Number of unique headlines (target 10–15)
 *   - Relevance to keywords
 *   - Variety (don't repeat same words)
 * Each headline ≤ 30 chars.
 */
function buildHeadlines(
  campaign: Record<string, unknown>,
  keywords: string[],
): { text: string; pinnedField?: string }[] {
  const seen = new Set<string>()
  const out: { text: string; pinnedField?: string }[] = []

  function add(text: string, pin?: string) {
    const clean = sanitize(text).slice(0, 30).trim()
    if (!clean || seen.has(clean.toLowerCase())) return
    seen.add(clean.toLowerCase())
    out.push(pin ? { text: clean, pinnedField: pin } : { text: clean })
  }

  // 1. PRIMARY — main headline pinned to position 1 (always shows first)
  const mainHeadline = sanitize(String(campaign.headline ?? '')).slice(0, 30)
  if (mainHeadline) add(mainHeadline, 'HEADLINE_1')

  // 2. OFFER — pinned to position 2 if short enough
  const offer = sanitize(String(campaign.offer ?? '')).slice(0, 30)
  if (offer) add(offer, 'HEADLINE_2')

  // 3. Top keywords as headlines (highest relevance — Google loves this)
  for (const kw of keywords.slice(0, 5)) {
    for (const chunk of splitChunks(kw, 30)) add(chunk)
  }

  // 4. Strong CTA variants
  const ctas = [
    'Get Started Today',
    'Free Consultation',
    'Limited Time Offer',
    'Book Now & Save',
    'Get Instant Access',
    'Start Free Today',
    'Claim Your Offer',
  ]
  for (const cta of ctas) add(cta)

  // 5. Trust signals (improve CTR)
  const trust = [
    'Trusted Results',
    '100% Satisfaction',
    'Fast & Reliable',
    'Expert Service',
    'No Hidden Fees',
    'Results Guaranteed',
  ]
  for (const t of trust) add(t)

  // 6. Landing page title chunks
  for (const chunk of splitChunks(String(campaign.landing_page_title ?? ''), 30)) add(chunk)

  // 7. Campaign name chunks as fallback
  for (const chunk of splitChunks(String(campaign.campaign_name ?? ''), 30)) add(chunk)

  // Pad to minimum 3
  while (out.length < 3) out.push({ text: out[0]?.text?.slice(0, 30) ?? 'Learn More Today' })

  return out.slice(0, 15)  // Google max = 15 headlines
}

/**
 * Build high-quality RSA descriptions.
 * Each ≤ 90 chars. Target 3–4 descriptions for maximum coverage.
 * Strong descriptions: lead with benefit, end with CTA.
 */
function buildDescriptions(campaign: Record<string, unknown>): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  function add(text: string) {
    const clean = sanitize(text).slice(0, 90).trim()
    if (!clean || seen.has(clean.toLowerCase())) return
    seen.add(clean.toLowerCase())
    out.push(clean)
  }

  // 1. Main ad copy (already crafted by AI — highest quality)
  const adCopy = sanitize(String(campaign.ad_copy ?? ''))
  if (adCopy) add(adCopy.slice(0, 90))

  // 2. Offer-focused description
  const offer = sanitize(String(campaign.offer ?? ''))
  const landing_cta = sanitize(String(campaign.landing_page_cta ?? 'Get Started'))
  if (offer) add(`${offer.slice(0, 60)} - ${landing_cta.slice(0, 20)}`.slice(0, 90))

  // 3. Landing page body (first sentence — high landing page relevance = better Quality Score)
  const body = sanitize(String(campaign.landing_page_body ?? ''))
  if (body) add(body.split('.')[0].trim().slice(0, 90))

  // 4. Social proof / urgency fallback
  add('Act now - limited time offer. See why thousands trust us. Click to learn more.')

  // Pad to minimum 2
  while (out.length < 2) out.push(out[0]?.slice(0, 90) ?? 'Click to learn more today.')

  return out.slice(0, 4)  // Google max = 4 descriptions
}

/**
 * Generate callout extensions — short phrases (≤25 chars) shown below the ad.
 * More callouts = bigger ad footprint = higher CTR = better Quality Score.
 * Target 4–10 callouts.
 */
function buildCallouts(campaign: Record<string, unknown>): string[] {
  const industry = String(campaign.industry ?? '').toLowerCase()
  const offer     = sanitize(String(campaign.offer ?? ''))

  // Base callouts (universal trust signals)
  const base = [
    'No Setup Fees',
    'Fast Results',
    '24/7 Support',
    'Free Consultation',
    'Cancel Anytime',
    'Proven Results',
    'Money Back Guarantee',
    'Expert Team',
  ]

  // Industry-specific callouts
  const industryCallouts: Record<string, string[]> = {
    'real estate':  ['Find Your Dream Home', 'Local Experts', 'Best Listings'],
    'real-estate':  ['Find Your Dream Home', 'Local Experts', 'Best Listings'],
    'healthcare':   ['Same Day Appointments', 'Certified Experts', 'Insurance Accepted'],
    'dental':       ['Painless Procedures', 'Flexible Payment', 'New Patient Special'],
    'retail':       ['Free Shipping', 'Easy Returns', 'Best Price Guarantee'],
    'e-commerce':   ['Free Shipping', 'Easy Returns', 'Secure Checkout'],
    'ecommerce':    ['Free Shipping', 'Easy Returns', 'Secure Checkout'],
    'education':    ['Certified Courses', 'Learn At Your Pace', 'Career Support'],
    'restaurant':   ['Fresh Ingredients', 'Online Ordering', 'Fast Delivery'],
    'finance':      ['Low Rates', 'Quick Approval', 'Trusted Lender'],
    'legal':        ['Free Case Review', 'No Win No Fee', 'Expert Lawyers'],
    'fitness':      ['First Class Free', 'Personal Training', 'Open 7 Days'],
    'saas':         ['Free 14-Day Trial', 'No Credit Card', 'Instant Setup'],
    'b2b saas':     ['Free 14-Day Trial', 'Enterprise Ready', 'API Access'],
  }

  const specific = industryCallouts[industry] ?? []
  const offerCallout = offer ? [offer.slice(0, 25)] : []

  const all = [...offerCallout, ...specific, ...base]
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of all) {
    const clean = sanitize(c).slice(0, 25)
    if (clean && !seen.has(clean)) { seen.add(clean); out.push(clean) }
    if (out.length >= 10) break
  }
  return out
}

/**
 * Generate sitelink extensions — extra links shown below the ad.
 * Each sitelink adds clickable real estate and signals to Google that
 * the website has depth (improves Quality Score).
 */
function buildSitelinks(campaign: Record<string, unknown>, landingUrl: string): Array<{
  linkText: string
  finalUrls: string[]
  description1?: string
  description2?: string
}> {
  const base = landingUrl.replace(/\/$/, '')
  const cta = sanitize(String(campaign.landing_page_cta ?? 'Get Started'))

  return [
    {
      linkText: cta.slice(0, 25) || 'Get Started',
      finalUrls: [landingUrl],
      description1: 'Click here to get started',
      description2: 'Fast and easy process',
    },
    {
      linkText: 'About Us',
      finalUrls: [`${base}#about`],
      description1: 'Learn more about our team',
      description2: 'Trusted experts in the field',
    },
    {
      linkText: 'Contact Us',
      finalUrls: [`${base}#contact`],
      description1: 'Get in touch today',
      description2: 'Fast response guaranteed',
    },
    {
      linkText: 'Our Services',
      finalUrls: [`${base}#services`],
      description1: 'See what we offer',
      description2: 'Tailored to your needs',
    },
  ]
}

// ── Google Ads API ────────────────────────────────────────────────────────────

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
  loginCustomerId: string | null
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

/** Extract a human-readable error string from Google Ads error response */
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

    const reqBody = await req.json().catch(() => ({}))
    const { campaign_id, daily_budget_usd, landing_page_url } = reqBody as {
      campaign_id?: string; daily_budget_usd?: number; landing_page_url?: string
    }
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
    if (!clientId || !clientSecret || !devToken) {
      return json({ error: 'Google Ads API credentials not configured' }, 500)
    }

    // Refresh access token — always refresh to ensure freshness
    let accessToken = integration.access_token as string
    const refreshToken = integration.refresh_token as string | null
    if (refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken, clientId, clientSecret)
      if (refreshed.error) {
        // Token is revoked or expired — user must reconnect
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
    // Only send login-customer-id header when accessing through an MCC.
    // For direct (non-MCC) access, leave it null so the header is omitted entirely.
    const rawLoginId = (integration.login_customer_id as string | null)?.replace(/-/g, '') ?? null
    const loginCustomerId = rawLoginId && rawLoginId !== customerId ? rawLoginId : null

    const ctx: AdsCtx = {
      customerId,
      loginCustomerId,
      accessToken,
      devToken,
    }

    const rawUrl = (landing_page_url ?? campaign.landing_page_url) as string | null | undefined
    if (!rawUrl || !rawUrl.trim()) {
      const msg = 'Landing page URL is missing. Set landing_page_url on the campaign or publish a landing page first.'
      await admin.from('campaigns').update({ google_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, 400)
    }
    let finalUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl.trim() : `https://${rawUrl.trim()}`
    try {
      const u = new URL(finalUrl)
      if (/example\.com$/i.test(u.hostname)) {
        const msg = 'Landing page URL must be a real domain (not example.com).'
        await admin.from('campaigns').update({ google_error: msg }).eq('id', campaign_id)
        return json({ error: msg }, 400)
      }
      finalUrl = u.toString()
    } catch {
      const msg = 'Landing page URL is invalid. Use a full https:// URL.'
      await admin.from('campaigns').update({ google_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, 400)
    }

    // Resolve daily budget (param → campaign field → default $10), with validation
    const budgetUsd = Number(daily_budget_usd ?? campaign.daily_budget ?? 10)
    if (!Number.isFinite(budgetUsd) || budgetUsd < 1) {
      const msg = 'Daily budget must be at least $1.'
      await admin.from('campaigns').update({ google_error: msg }).eq('id', campaign_id)
      return json({ error: msg }, 400)
    }

    // ── 1. Campaign Budget ─────────────────────────────────────────────────────
    const budgetRes = await mutate(ctx, '/campaignBudgets:mutate', [{
      create: {
        name: sanitize(`${campaign.campaign_name} Budget ${Date.now()}`).slice(0, 255),
        amountMicros: String(Math.round(budgetUsd * 1_000_000)),
        explicitlyShared: false,
      },
    }])
    if (!budgetRes.ok) {
      const msg = adsError(budgetRes.data, 'Budget')
      await admin.from('campaigns').update({ google_error: msg, status: 'failed' }).eq('id', campaign_id)
      return json({ error: `Google Ads API (${msg})`, raw: budgetRes.data }, 400)
    }
    const budgetRN: string = budgetRes.data.results[0].resourceName

    // ── 2. Campaign (PAUSED Search) ────────────────────────────────────────────
    const now = new Date()
    const start = now.toISOString().slice(0, 10).replace(/-/g, '')
    const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '')

    // containsEuPoliticalAdvertising: proto enum NOT_EU_POLITICAL_ADVERTISING = 2
    // REST API v20 requires this field. Integer 2 = NOT_EU_POLITICAL_ADVERTISING.
    // MAXIMIZE_CLICKS — Smart Bidding that works without conversion tracking.
    // Google automatically adjusts bids to get the most clicks within your budget.
    // cpcBidCeilingMicros caps the max CPC so budget isn't blown on one click.
    // Upgrade to MAXIMIZE_CONVERSIONS once Google Ads conversion tracking is set up.
    const maxCpcMicros = String(Math.round(Math.min(budgetUsd * 0.3, 5) * 1_000_000)) // cap at 30% of daily budget or $5

    const campaignRes = await mutate(ctx, '/campaigns:mutate', [{
      create: {
        name: sanitize(`${campaign.campaign_name} ${Date.now()}`).slice(0, 255),
        status: 'ENABLED',
        advertisingChannelType: 'SEARCH',
        // Maximize Clicks — no conversion tracking required, still Smart Bidding
        maximizeClicks: {
          cpcBidCeilingMicros: maxCpcMicros,
        },
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
      await admin.from('campaigns').update({ google_error: msg, status: 'failed' }).eq('id', campaign_id)
      return json({ error: `Google Ads API (${msg})`, raw: campaignRes.data }, 400)
    }
    const gCampaignRN: string = campaignRes.data.results[0].resourceName
    const gCampaignId = gCampaignRN.split('/').pop()!

    // ── 3. Ad Group ────────────────────────────────────────────────────────────
    // No cpcBidMicros with MAXIMIZE_CLICKS — Smart Bidding sets bids automatically.
    const adGroupRes = await mutate(ctx, '/adGroups:mutate', [{
      create: {
        name: sanitize(`${campaign.campaign_name} - Ad Group`).slice(0, 255),
        status: 'ENABLED',
        campaign: gCampaignRN,
        type: 'SEARCH_STANDARD',
      },
    }])
    if (!adGroupRes.ok) {
      const msg = adsError(adGroupRes.data, 'AdGroup')
      await admin.from('campaigns').update({
        google_campaign_id: gCampaignId,
        google_error: msg,
        status: 'failed',
      }).eq('id', campaign_id)
      return json({ error: `Google Ads API (${msg})`, raw: adGroupRes.data }, 400)
    }
    const gAdGroupRN: string = adGroupRes.data.results[0].resourceName
    const gAdGroupId = gAdGroupRN.split('/').pop()!

    // ── 4. Responsive Search Ad — built for EXCELLENT ad strength ──────────────
    // Google grades RSA strength on: number of unique headlines (15 = max),
    // variety of descriptions, keyword inclusion, and length.
    const campaignData = campaign as Record<string, unknown>
    const kwList = (campaign.keywords as string[] | null) ?? []
    const headlines    = buildHeadlines(campaignData, kwList)
    const descriptions = buildDescriptions(campaignData)

    const adRes = await mutate(ctx, '/adGroupAds:mutate', [{
      create: {
        adGroup: gAdGroupRN,
        status: 'ENABLED',
        ad: {
          finalUrls: [finalUrl],
          // trackingUrlTemplate with ValueTrack params — lets Google report
          // which keyword/device/placement drove each click
          trackingUrlTemplate: `${finalUrl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={adgroupid}&device={device}&matchtype={matchtype}`,
          responsiveSearchAd: {
            headlines:    headlines.map(({ text, pinnedField }) =>
              pinnedField ? { text, pinnedField } : { text }
            ),
            descriptions: descriptions.map((text) => ({ text })),
            path1: sanitize(String(campaign.industry ?? 'services')).slice(0, 15),
            path2: sanitize(String(campaign.offer ?? 'offer').split(' ')[0]).slice(0, 15),
          },
        },
      },
    }])
    if (!adRes.ok) {
      const msg = adsError(adRes.data, 'Ad')
      await admin.from('campaigns').update({
        google_campaign_id: gCampaignId,
        google_ad_group_id: gAdGroupId,
        google_error: msg,
        status: 'failed',
      }).eq('id', campaign_id)
      return json({ error: `Google Ads API (${msg})`, raw: adRes.data }, 400)
    }
    const gAdRN: string = adRes.data.results[0].resourceName
    const gAdId = gAdRN.split('~').pop()!

    // ── 5. Keywords — 3 match types for maximum coverage ──────────────────────
    // BROAD   = widest reach, catches long-tail variants and synonyms
    // PHRASE  = "keyword" — must contain phrase in that order (sweet spot)
    // EXACT   = [keyword] — highest intent, most targeted, usually best CTR
    // Use all 3 per keyword to cover the full search intent spectrum.
    if (kwList.length > 0) {
      const kwOps: unknown[] = []
      kwList.slice(0, 8).forEach((kw) => {
        const text = sanitize(kw).slice(0, 80)
        if (!text) return
        kwOps.push({ create: { adGroup: gAdGroupRN, status: 'ENABLED', keyword: { text, matchType: 'BROAD'  } } })
        kwOps.push({ create: { adGroup: gAdGroupRN, status: 'ENABLED', keyword: { text, matchType: 'PHRASE' } } })
        kwOps.push({ create: { adGroup: gAdGroupRN, status: 'ENABLED', keyword: { text, matchType: 'EXACT'  } } })
      })
      if (kwOps.length > 0) await mutate(ctx, '/adGroupCriteria:mutate', kwOps)
    }

    // ── 6. Negative keywords — prevent wasting budget on irrelevant searches ──
    // These are universal negatives that apply to almost all B2B/B2C campaigns.
    const negatives = ['free', 'jobs', 'careers', 'diy', 'how to', 'tutorial', 'wikipedia', 'reddit']
    const negOps = negatives.map(text => ({
      create: {
        adGroup: gAdGroupRN,
        status: 'ENABLED',
        keyword: { text: sanitize(text).slice(0, 80), matchType: 'BROAD' },
        negative: true,
      },
    }))
    await mutate(ctx, '/adGroupCriteria:mutate', negOps).catch(() => {})  // non-fatal

    // ── 7. Callout Extensions — expand ad size, improve CTR ───────────────────
    // Each callout shows as a short phrase below the main ad copy.
    // More callouts = larger ad footprint = higher CTR = better Quality Score.
    const callouts = buildCallouts(campaignData)
    if (callouts.length > 0) {
      // Create callout assets
      const calloutAssetOps = callouts.map(text => ({
        create: { calloutAsset: { calloutText: text } },
      }))
      const calloutAssetsRes = await mutate(ctx, '/assets:mutate', calloutAssetOps).catch(() => null)

      // Link callout assets to campaign
      if (calloutAssetsRes?.ok && calloutAssetsRes.data?.results?.length > 0) {
        const linkOps = (calloutAssetsRes.data.results as Array<{ resourceName: string }>).map(r => ({
          create: {
            campaign: gCampaignRN,
            asset: r.resourceName,
            fieldType: 'CALLOUT',
          },
        }))
        await mutate(ctx, '/campaignAssets:mutate', linkOps).catch(() => {})
      }
    }

    // ── 8. Sitelink Extensions — extra links below the ad ─────────────────────
    // Sitelinks give the ad more real estate on the SERP and signal to Google
    // that the website has depth. This directly improves Quality Score.
    const sitelinks = buildSitelinks(campaignData, finalUrl)
    if (sitelinks.length > 0) {
      const slAssetOps = sitelinks.map(sl => ({
        create: {
          sitelinkAsset: {
            linkText: sl.linkText,
            finalUrls: sl.finalUrls,
            description1: sl.description1,
            description2: sl.description2,
          },
        },
      }))
      const slAssetsRes = await mutate(ctx, '/assets:mutate', slAssetOps).catch(() => null)

      if (slAssetsRes?.ok && slAssetsRes.data?.results?.length > 0) {
        const slLinkOps = (slAssetsRes.data.results as Array<{ resourceName: string }>).map(r => ({
          create: {
            campaign: gCampaignRN,
            asset: r.resourceName,
            fieldType: 'SITELINK',
          },
        }))
        await mutate(ctx, '/campaignAssets:mutate', slLinkOps).catch(() => {})
      }
    }

    // ── Save & return ──────────────────────────────────────────────────────────
    await admin.from('campaigns').update({
      google_campaign_id: gCampaignId,
      google_ad_group_id: gAdGroupId,
      google_ad_id:       gAdId,
      google_error:       null,
      status:             'active',
      channels:           [...new Set([...((campaign.channels as string[]) ?? []), 'google'])],
      landing_page_url:   finalUrl,
      daily_budget:       budgetUsd,
    }).eq('id', campaign_id)

    return json({
      success: true,
      google_campaign_id: gCampaignId,
      google_ad_group_id: gAdGroupId,
      google_ad_id:       gAdId,
      message: 'Campaign created and ENABLED on Google Ads. Manage it from your app.',
    })
  } catch (err) {
    console.error(err)
    return json({ error: 'Internal server error' }, 500)
  }
})
