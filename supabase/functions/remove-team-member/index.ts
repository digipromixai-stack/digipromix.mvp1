/**
 * remove-team-member — revokes a teammate's access to the business.
 *
 * POST { member_id: string } — authenticated. Caller must be an active
 * 'owner' or 'admin' of the same organization as the target member.
 * Soft-delete only (status='removed') — never touches the auth user.
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

    const { member_id } = await req.json().catch(() => ({})) as { member_id?: string }
    if (!member_id) return json({ error: 'member_id is required' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const { data: target, error: targetErr } = await admin
      .from('organization_members')
      .select('id, organization_id, role')
      .eq('id', member_id)
      .single()
    if (targetErr || !target) return json({ error: 'Member not found' }, 404)
    if (target.role === 'owner') return json({ error: 'Cannot remove the business owner' }, 400)

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('owner_id')
      .eq('id', target.organization_id)
      .single()
    if (orgErr || !org) return json({ error: 'Organization not found' }, 404)

    const isOwner = org.owner_id === user.id
    let isAdmin = false
    if (!isOwner) {
      const { data: callerMembership } = await admin
        .from('organization_members')
        .select('role, status')
        .eq('organization_id', target.organization_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
      isAdmin = callerMembership?.role === 'admin'
    }
    if (!isOwner && !isAdmin) return json({ error: 'Only an owner or admin can remove teammates' }, 403)

    const { error: updateErr } = await admin
      .from('organization_members')
      .update({ status: 'removed' })
      .eq('id', member_id)
    if (updateErr) throw updateErr

    return json({ success: true })
  } catch (err) {
    console.error('remove-team-member error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
