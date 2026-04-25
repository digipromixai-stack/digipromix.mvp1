/**
 * google-ads-oauth Edge Function
 *
 * POST { action: 'exchange', code, redirect_uri }
 *   → exchanges OAuth code for access + refresh tokens
 *   → lists accessible Google Ads customer accounts
 *   → returns { access_token, refresh_token, expires_at, accounts }
 *
 * POST { action: 'save', access_token, refresh_token, expires_at,
 *        account_id, account_name, login_customer_id? }
 *   → stores the chosen customer account in ad_integrations (platform='google')
 *
 * POST { action: 'disconnect' }
 *   → removes the Google row from ad_integrations
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v17'

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

    const body = await req.json()
    const { action } = body

    // ── EXCHANGE code for tokens ───────────────────────────────────
    if (action === 'exchange') {
      const { code, redirect_uri } = body
      if (!code || !redirect_uri) return json({ error: 'code and redirect_uri required' }, 400)

      const clientId     = await getSecret(admin, 'GOOGLE_ADS_CLIENT_ID', 'google_ads_client_id')
      const clientSecret = await getSecret(admin, 'GOOGLE_ADS_CLIENT_SECRET', 'google_ads_client_secret')
      const devToken     = await getSecret(admin, 'GOOGLE_ADS_DEVELOPER_TOKEN', 'google_ads_developer_token')
      if (!clientId || !clientSecret) return json({ error: 'GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET not configured' }, 500)

      // Exchange code → tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri,
          grant_type: 'authorization_code',
        }),
      })
      const tokenData = await tokenRes.json()
      if (tokenData.error) return json({ error: tokenData.error_description ?? tokenData.error }, 400)

      const accessToken: string  = tokenData.access_token
      const refreshToken: string = tokenData.refresh_token ?? ''
      const expiresIn: number    = tokenData.expires_in ?? 3600
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

      // List accessible Google Ads customers
      let accounts: Array<{ id: string; resource_name: string; descriptive_name?: string }> = []
      if (devToken) {
        const listRes = await fetch(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'developer-token': devToken,
          },
        })
        const listData = await listRes.json()
        if (listData.resourceNames && Array.isArray(listData.resourceNames)) {
          accounts = (listData.resourceNames as string[]).map(rn => ({
            id: rn.replace('customers/', ''),
            resource_name: rn,
          }))

          // Try to fetch descriptive names for each (best-effort, fail-soft)
          for (const acc of accounts) {
            try {
              const detailRes = await fetch(
                `${GOOGLE_ADS_API}/customers/${acc.id}/googleAds:searchStream`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'developer-token': devToken,
                    'login-customer-id': acc.id,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    query: 'SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1',
                  }),
                }
              )
              const detail = await detailRes.json()
              const name = detail?.[0]?.results?.[0]?.customer?.descriptiveName
              if (name) acc.descriptive_name = name
            } catch { /* ignore */ }
          }
        }
      }

      return json({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        accounts,
      })
    }

    // ── SAVE chosen account ────────────────────────────────────────
    if (action === 'save') {
      const { access_token, refresh_token, expires_at, account_id, account_name, login_customer_id } = body
      if (!access_token || !account_id) return json({ error: 'access_token and account_id required' }, 400)

      const { error } = await admin.from('ad_integrations').upsert(
        {
          user_id: user.id,
          platform: 'google',
          access_token,
          refresh_token: refresh_token ?? null,
          account_id,
          account_name: account_name ?? null,
          login_customer_id: login_customer_id ?? null,
          token_expires_at: expires_at ?? null,
          is_active: true,
        },
        { onConflict: 'user_id,platform' }
      )

      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    // ── DISCONNECT ─────────────────────────────────────────────────
    if (action === 'disconnect') {
      const { error } = await admin
        .from('ad_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('platform', 'google')

      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error(err)
    return json({ error: 'Internal server error' }, 500)
  }
})
