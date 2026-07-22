/**
 * upgrade-to-team-plan — simulated plan purchase (no payment gateway).
 *
 * POST {} — authenticated. Creates the caller's organization (if absent)
 * on the 'team' plan and marks them as its 'owner' member. Idempotent:
 * calling it again on an already-team org is a no-op that returns the
 * existing organization.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
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

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .upsert(
        { owner_id: user.id, plan: 'team' },
        { onConflict: 'owner_id' }
      )
      .select()
      .single()
    if (orgErr) throw orgErr

    const { error: memberErr } = await admin
      .from('organization_members')
      .upsert(
        {
          organization_id: org.id,
          user_id: user.id,
          email: user.email,
          role: 'owner',
          status: 'active',
          joined_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,email' }
      )
    if (memberErr) throw memberErr

    return json({ success: true, organization: org })
  } catch (err) {
    console.error('upgrade-to-team-plan error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
