/**
 * meta-oauth Edge Function
 *
 * POST /meta-oauth  { action: 'exchange', code, redirect_uri }
 *   → exchanges OAuth code for access token, fetches ad accounts + pages
 *   → returns { accounts: [...], pages: [...], access_token }
 *
 * POST /meta-oauth  { action: 'save', access_token, account_id, account_name, page_id, page_name }
 *   → stores the chosen account in ad_integrations
 *
 * POST /meta-oauth  { action: 'disconnect' }
 *   → removes the Meta row from ad_integrations
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

async function graphGet(path: string, token: string) {
  const res = await fetch(`${GRAPH}${path}&access_token=${token}`)
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

    const body = await req.json()
    const { action } = body

    // ── EXCHANGE code for token ────────────────────────────────────
    if (action === 'exchange') {
      const { code, redirect_uri } = body
      if (!code || !redirect_uri) return json({ error: 'code and redirect_uri required' }, 400)

      const appId     = Deno.env.get('META_APP_ID')
      const appSecret = Deno.env.get('META_APP_SECRET')
      if (!appId || !appSecret) return json({ error: 'META_APP_ID / META_APP_SECRET not configured' }, 500)

      // Exchange code → short-lived token
      const tokenRes = await fetch(
        `${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirect_uri)}&code=${code}`
      )
      const tokenData = await tokenRes.json()
      if (tokenData.error) return json({ error: tokenData.error.message }, 400)

      const shortToken: string = tokenData.access_token

      // Exchange → long-lived token (~60 days)
      const llRes = await fetch(
        `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
      )
      const llData = await llRes.json()
      const longToken: string = llData.access_token ?? shortToken
      const expiresIn: number = llData.expires_in ?? 5184000 // 60 days fallback

      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

      // Fetch ad accounts
      const adAccountsData = await graphGet(
        '/me/adaccounts?fields=name,account_id,account_status,currency',
        longToken
      )

      // Fetch pages
      const pagesData = await graphGet(
        '/me/accounts?fields=name,id,category',
        longToken
      )

      return json({
        access_token: longToken,
        expires_at: expiresAt,
        accounts: adAccountsData.data ?? [],
        pages: pagesData.data ?? [],
      })
    }

    // ── SAVE chosen account ────────────────────────────────────────
    if (action === 'save') {
      const { access_token, account_id, account_name, page_id, page_name, expires_at } = body
      if (!access_token || !account_id) return json({ error: 'access_token and account_id required' }, 400)

      const { error } = await admin.from('ad_integrations').upsert(
        {
          user_id: user.id,
          platform: 'meta',
          access_token,
          account_id,
          account_name: account_name ?? null,
          page_id: page_id ?? null,
          page_name: page_name ?? null,
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
        .eq('platform', 'meta')

      if (error) return json({ error: error.message }, 500)
      return json({ success: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error(err)
    return json({ error: 'Internal server error' }, 500)
  }
})
