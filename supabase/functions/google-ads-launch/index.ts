import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * google-ads-launch — Create a Google Ads counter-campaign
 *
 * POST body:
 * {
 *   change_id:     string   // detected_changes.id — used to pull competitor/title context
 *   campaign_name: string   // human-readable name
 *   headline:      string   // ≤30 chars, shown in ad
 *   description:   string   // ≤90 chars, shown in ad
 *   final_url:     string   // landing page URL
 *   daily_budget:  number   // USD, e.g. 20
 *   keywords?:     string[] // optional — default ["buy", competitor domain]
 * }
 *
 * Returns: { ad_campaign_id, external_campaign_id, status }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function makeAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Refresh an expired access token using the stored refresh_token
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

// ── Google Ads REST helpers ───────────────────────────────────────────────────

interface AdsHeaders {
  Authorization: string
  'developer-token': string
  'Content-Type': string
  'login-customer-id'?: string
}

function makeAdsHeaders(accessToken: string, loginCustomerId?: string): AdsHeaders {
  const h: AdsHeaders = {
    Authorization:    `Bearer ${accessToken}`,
    'developer-token': Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')!,
    'Content-Type':   'application/json',
  }
  if (loginCustomerId) h['login-customer-id'] = loginCustomerId
  return h
}

const ADS_BASE = 'https://googleads.googleapis.com/v18'

// Create a Search campaign (PAUSED — user reviews before activating)
async function createCampaign(
  accessToken: string,
  customerId: string,
  name: string,
  dailyBudgetMicros: number,
): Promise<string> {
  // Step 1: Create campaign budget
  const budgetRes = await fetch(`${ADS_BASE}/customers/${customerId}/campaignBudgets:mutate`, {
    method: 'POST',
    headers: makeAdsHeaders(accessToken),
    body: JSON.stringify({
      operations: [{
        create: {
          name:           `${name} Budget`,
          amountMicros:   dailyBudgetMicros,
          deliveryMethod: 'STANDARD',
        },
      }],
    }),
  })

  if (!budgetRes.ok) {
    throw new Error(`Budget creation failed: ${await budgetRes.text()}`)
  }

  const budgetData   = await budgetRes.json()
  const budgetRN: string = budgetData.results?.[0]?.resourceName
  if (!budgetRN) throw new Error('No budget resourceName returned')

  // Step 2: Create campaign
  const campRes = await fetch(`${ADS_BASE}/customers/${customerId}/campaigns:mutate`, {
    method: 'POST',
    headers: makeAdsHeaders(accessToken),
    body: JSON.stringify({
      operations: [{
        create: {
          name:                   name,
          status:                 'PAUSED',             // safe default
          advertisingChannelType: 'SEARCH',
          campaignBudget:         budgetRN,
          biddingStrategyType:    'MAXIMIZE_CLICKS',
          networkSettings: {
            targetGoogleSearch:        true,
            targetSearchNetwork:       true,
            targetContentNetwork:      false,
          },
        },
      }],
    }),
  })

  if (!campRes.ok) {
    throw new Error(`Campaign creation failed: ${await campRes.text()}`)
  }

  const campData = await campRes.json()
  const campaignRN: string = campData.results?.[0]?.resourceName
  if (!campaignRN) throw new Error('No campaign resourceName returned')

  return campaignRN
}

// Create an ad group inside the campaign
async function createAdGroup(
  accessToken: string,
  customerId: string,
  campaignRN: string,
  name: string,
): Promise<string> {
  const res = await fetch(`${ADS_BASE}/customers/${customerId}/adGroups:mutate`, {
    method: 'POST',
    headers: makeAdsHeaders(accessToken),
    body: JSON.stringify({
      operations: [{
        create: {
          name:     name,
          campaign: campaignRN,
          status:   'ENABLED',
          type:     'SEARCH_STANDARD',
          cpcBidMicros: 1_000_000, // $1.00 default CPC
        },
      }],
    }),
  })

  if (!res.ok) throw new Error(`Ad group creation failed: ${await res.text()}`)

  const data = await res.json()
  const adGroupRN: string = data.results?.[0]?.resourceName
  if (!adGroupRN) throw new Error('No adGroup resourceName returned')

  return adGroupRN
}

// Add keywords to the ad group
async function addKeywords(
  accessToken: string,
  customerId: string,
  adGroupRN: string,
  keywords: string[],
): Promise<void> {
  const operations = keywords.map((kw) => ({
    create: {
      adGroup:   adGroupRN,
      text:      kw,
      matchType: 'BROAD',
      status:    'ENABLED',
    },
  }))

  const res = await fetch(`${ADS_BASE}/customers/${customerId}/adGroupCriteria:mutate`, {
    method: 'POST',
    headers: makeAdsHeaders(accessToken),
    body: JSON.stringify({ operations }),
  })

  if (!res.ok) {
    console.warn('Keyword creation warning:', await res.text())
    // Non-fatal — campaign still runs without explicit keywords
  }
}

// Create a Responsive Search Ad (RSA)
async function createRSA(
  accessToken: string,
  customerId: string,
  adGroupRN: string,
  headlines: string[],
  descriptions: string[],
  finalUrl: string,
): Promise<string> {
  // RSA requires 3-15 headlines and 2-4 descriptions, each with a pinned/unpinned asset
  const headlineAssets = headlines.slice(0, 10).map((text) => ({ text }))
  const descAssets     = descriptions.slice(0, 4).map((text) => ({ text }))

  const res = await fetch(`${ADS_BASE}/customers/${customerId}/adGroupAds:mutate`, {
    method: 'POST',
    headers: makeAdsHeaders(accessToken),
    body: JSON.stringify({
      operations: [{
        create: {
          adGroup: adGroupRN,
          status:  'ENABLED',
          ad: {
            finalUrls: [finalUrl],
            responsiveSearchAd: {
              headlines:    headlineAssets,
              descriptions: descAssets,
            },
          },
        },
      }],
    }),
  })

  if (!res.ok) throw new Error(`RSA creation failed: ${await res.text()}`)

  const data = await res.json()
  return data.results?.[0]?.resourceName ?? ''
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  // Authenticate caller — require valid Supabase JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return jsonResponse({ error: 'Invalid token' }, 401)
  }

  const supabaseAdmin = makeAdmin()

  let body: {
    change_id?:     string
    campaign_name?: string
    headline?:      string
    description?:   string
    final_url?:     string
    daily_budget?:  number
    keywords?:      string[]
  } = {}

  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const {
    change_id,
    campaign_name,
    headline,
    description,
    final_url,
    daily_budget = 20,
    keywords,
  } = body

  if (!campaign_name || !headline || !description || !final_url) {
    return jsonResponse({ error: 'campaign_name, headline, description, final_url are required' }, 400)
  }

  // Validate headline/description lengths (Google Ads limits)
  if (headline.length > 30) {
    return jsonResponse({ error: 'headline must be ≤30 characters' }, 400)
  }
  if (description.length > 90) {
    return jsonResponse({ error: 'description must be ≤90 characters' }, 400)
  }

  // Load the user's Google Ads integration
  const { data: integration } = await supabaseAdmin
    .from('ad_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('platform', 'google_ads')
    .eq('is_active', true)
    .single()

  if (!integration) {
    return jsonResponse({ error: 'Google Ads not connected. Please connect in Settings.' }, 400)
  }

  if (!integration.account_id) {
    return jsonResponse({ error: 'No Google Ads customer account found. Please reconnect.' }, 400)
  }

  // Get competitor info if change_id provided
  let competitorId: string | null = null
  let competitorDomain: string | null = null
  if (change_id) {
    const { data: change } = await supabaseAdmin
      .from('detected_changes')
      .select('competitor_id, competitors(name, website_url)')
      .eq('id', change_id)
      .single()

    if (change) {
      competitorId = change.competitor_id
      const comp = change.competitors as { name: string; website_url: string } | null
      if (comp?.website_url) {
        try {
          competitorDomain = new URL(comp.website_url).hostname.replace('www.', '')
        } catch { /* ignore */ }
      }
    }
  }

  // Insert ad_campaign row (status: creating)
  const { data: adCampaignRow, error: insertErr } = await supabaseAdmin
    .from('ad_campaigns')
    .insert({
      user_id:       user.id,
      competitor_id: competitorId,
      change_id:     change_id ?? null,
      platform:      'google_ads',
      campaign_name,
      headline,
      description,
      final_url,
      daily_budget_usd: daily_budget,
      status:        'creating',
    })
    .select()
    .single()

  if (insertErr || !adCampaignRow) {
    return jsonResponse({ error: 'Failed to create campaign record' }, 500)
  }

  // Refresh access token if expired (or always refresh to be safe)
  let accessToken: string
  try {
    accessToken = await refreshAccessToken(integration.refresh_token)
    // Update stored access token
    await supabaseAdmin
      .from('ad_integrations')
      .update({
        access_token:    accessToken,
        token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      })
      .eq('id', integration.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabaseAdmin.from('ad_campaigns').update({ status: 'error', error_message: msg }).eq('id', adCampaignRow.id)
    return jsonResponse({ error: `Token refresh failed: ${msg}` }, 500)
  }

  const customerId = integration.account_id.replace(/-/g, '') // strip dashes

  try {
    // 1. Create campaign (PAUSED)
    const dailyBudgetMicros = Math.round(daily_budget * 1_000_000)
    const campaignRN = await createCampaign(accessToken, customerId, campaign_name, dailyBudgetMicros)
    const externalCampaignId = campaignRN.split('/').pop() ?? campaignRN

    // 2. Create ad group
    const adGroupRN = await createAdGroup(accessToken, customerId, campaignRN, `${campaign_name} - Main`)
    const externalAdGroupId = adGroupRN.split('/').pop() ?? adGroupRN

    // 3. Add keywords
    const defaultKeywords = competitorDomain
      ? [competitorDomain, `buy ${competitorDomain}`, `${competitorDomain} alternative`]
      : ['competitor alternative', 'best deal']
    await addKeywords(accessToken, customerId, adGroupRN, keywords ?? defaultKeywords)

    // 4. Create RSA — generate 3 headlines from the single headline input
    const headlineVariants = [
      headline,
      headline.length <= 25 ? `${headline} - Act Now` : headline,
      headline.length <= 22 ? `${headline} - Best Price` : headline,
    ]
    await createRSA(accessToken, customerId, adGroupRN, headlineVariants, [description], final_url)

    // Update ad_campaign record with external IDs and paused status
    await supabaseAdmin
      .from('ad_campaigns')
      .update({
        external_campaign_id: externalCampaignId,
        external_ad_group_id: externalAdGroupId,
        status:               'paused',
      })
      .eq('id', adCampaignRow.id)

    return jsonResponse({
      ad_campaign_id:       adCampaignRow.id,
      external_campaign_id: externalCampaignId,
      external_ad_group_id: externalAdGroupId,
      status:               'paused',
      message:              'Campaign created in Google Ads (PAUSED). Review and activate in your Google Ads account.',
      google_ads_url:       `https://ads.google.com/aw/campaigns?campaignId=${externalCampaignId}`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Google Ads API error:', msg)
    await supabaseAdmin
      .from('ad_campaigns')
      .update({ status: 'error', error_message: msg })
      .eq('id', adCampaignRow.id)
    return jsonResponse({ error: `Google Ads API error: ${msg}` }, 500)
  }
})
