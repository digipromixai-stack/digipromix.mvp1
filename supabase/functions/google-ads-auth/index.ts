import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * google-ads-auth — OAuth2 callback handler for Google Ads
 *
 * Flow:
 *   1. Frontend redirects user to Google OAuth consent screen
 *   2. Google redirects back to: /functions/v1/google-ads-auth?code=...&state=<userId>
 *   3. This function exchanges the code for tokens, fetches the customer list,
 *      and upserts a row into ad_integrations
 *   4. Redirects browser to /settings?google_ads=connected (or ?error=...)
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

// Exchange authorization code for access_token + refresh_token
async function exchangeCode(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
  const redirectUri  = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-ads-auth`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange failed: ${err}`)
  }

  return res.json()
}

// Fetch the user's accessible Google Ads customer IDs
async function fetchAccessibleCustomers(accessToken: string): Promise<string[]> {
  const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN')!
  const res = await fetch(
    'https://googleads.googleapis.com/v18/customers:listAccessibleCustomers',
    {
      headers: {
        Authorization:    `Bearer ${accessToken}`,
        'developer-token': developerToken,
      },
    },
  )

  if (!res.ok) {
    console.warn('Could not list accessible customers:', await res.text())
    return []
  }

  const data = await res.json()
  // resourceNames look like "customers/1234567890"
  return (data.resourceNames ?? []).map((r: string) => r.replace('customers/', ''))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')   // userId passed via state param
  const error  = url.searchParams.get('error')

  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

  // Google returned an error (user denied, etc.)
  if (error) {
    return Response.redirect(`${appUrl}/settings?google_ads=error&reason=${encodeURIComponent(error)}`, 302)
  }

  if (!code || !state) {
    return Response.redirect(`${appUrl}/settings?google_ads=error&reason=missing_params`, 302)
  }

  const userId = state

  try {
    // 1. Exchange code for tokens
    const tokens = await exchangeCode(code)

    // 2. Fetch customer IDs to get the primary account
    const customerIds = await fetchAccessibleCustomers(tokens.access_token)
    const primaryCustomerId = customerIds[0] ?? null

    // 3. Upsert into ad_integrations (service role — bypasses RLS)
    const supabaseAdmin = makeAdmin()
    const { error: upsertErr } = await supabaseAdmin
      .from('ad_integrations')
      .upsert({
        user_id:         userId,
        platform:        'google_ads',
        access_token:    tokens.access_token,
        refresh_token:   tokens.refresh_token,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        account_id:      primaryCustomerId,
        account_name:    primaryCustomerId ? `Google Ads #${primaryCustomerId}` : 'Google Ads',
        is_active:       true,
        last_error:      null,
      }, { onConflict: 'user_id,platform' })

    if (upsertErr) {
      console.error('DB upsert error:', upsertErr)
      return Response.redirect(`${appUrl}/settings?google_ads=error&reason=db_error`, 302)
    }

    return Response.redirect(`${appUrl}/settings?google_ads=connected`, 302)
  } catch (err) {
    console.error('google-ads-auth error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return Response.redirect(`${appUrl}/settings?google_ads=error&reason=${encodeURIComponent(msg)}`, 302)
  }
})
