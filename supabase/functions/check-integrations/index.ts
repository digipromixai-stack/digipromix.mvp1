/**
 * check-integrations Edge Function
 *
 * POST {} — asks Meta and Google whether the caller's stored tokens still work,
 * instead of trusting the stored is_active flag / expiry date. Marks a dead
 * integration is_active=false so Settings shows "Expired — reconnect".
 *
 * Returns { meta?: Status, google?: Status } where
 *   Status = { status: 'connected' | 'expired' | 'error', detail?: string }
 * 'error' means the check itself failed (network etc.) — the flag is left as is.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { META_GRAPH } from '../_shared/config.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

type Status = { status: 'connected' | 'expired' | 'error'; detail?: string }

async function checkMeta(token: string): Promise<Status> {
  try {
    const res = await fetch(`${META_GRAPH}/me?fields=id`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
    const body = await res.json().catch(() => ({})) as { id?: string; error?: { code?: number; message?: string } }
    if (body.id) return { status: 'connected' }
    // 190 = invalid/expired token, 102 = session expired, 463 = token expired
    if (body.error && [190, 102, 463].includes(body.error.code ?? 0)) {
      return { status: 'expired', detail: body.error.message }
    }
    return { status: 'error', detail: body.error?.message ?? `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
}

async function getSecret(admin: ReturnType<typeof createClient>, envName: string, vaultName: string) {
  const fromEnv = Deno.env.get(envName)
  if (fromEnv) return fromEnv
  const { data } = await admin.rpc('get_vault_secret', { secret_name: vaultName })
  return (data as string | null) ?? null
}

async function checkGoogle(admin: ReturnType<typeof createClient>, refreshToken: string | null): Promise<Status & { access_token?: string; expires_in?: number }> {
  if (!refreshToken) return { status: 'expired', detail: 'No refresh token stored' }
  const clientId     = await getSecret(admin, 'GOOGLE_ADS_CLIENT_ID', 'google_ads_client_id')
  const clientSecret = await getSecret(admin, 'GOOGLE_ADS_CLIENT_SECRET', 'google_ads_client_secret')
  if (!clientId || !clientSecret) return { status: 'error', detail: 'Google OAuth credentials not configured' }
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(8000),
    })
    const body = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    if (body.access_token) return { status: 'connected', access_token: body.access_token, expires_in: body.expires_in }
    // invalid_grant = refresh token revoked or expired
    if (body.error === 'invalid_grant') return { status: 'expired', detail: body.error_description }
    return { status: 'error', detail: body.error_description ?? body.error ?? `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: integrations, error } = await admin
    .from('ad_integrations').select('id, platform, access_token, refresh_token').eq('user_id', user.id)
  if (error) return json({ error: error.message }, 500)

  const result: Record<string, Status> = {}
  await Promise.all((integrations ?? []).map(async (i) => {
    if (i.platform === 'meta') {
      const s = await checkMeta(i.access_token as string)
      result.meta = s
      if (s.status !== 'error') {
        await admin.from('ad_integrations').update({ is_active: s.status === 'connected' }).eq('id', i.id)
      }
    } else if (i.platform === 'google') {
      const { access_token, expires_in, ...s } = await checkGoogle(admin, i.refresh_token as string | null)
      result.google = s
      if (s.status === 'connected') {
        await admin.from('ad_integrations').update({
          is_active: true,
          access_token,
          token_expires_at: new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString(),
        }).eq('id', i.id)
      } else if (s.status === 'expired') {
        await admin.from('ad_integrations').update({ is_active: false }).eq('id', i.id)
      }
    }
  }))

  return json(result)
})
