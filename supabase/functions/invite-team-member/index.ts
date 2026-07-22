/**
 * invite-team-member — sends a Supabase email invite and links the invited
 * user to the caller's business straight away.
 *
 * POST { email: string, role: 'admin' | 'member' } — authenticated.
 * Caller must be an active 'owner' or 'admin' of a 'team' plan organization.
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

    const { email, role } = await req.json().catch(() => ({})) as { email?: string; role?: string }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'A valid email is required' }, 400)
    }
    if (role !== 'admin' && role !== 'member') {
      return json({ error: "role must be 'admin' or 'member'" }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    // Caller must be an active owner/admin of a team-plan org
    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('id, plan, owner_id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (orgErr) throw orgErr

    let organizationId: string
    if (org) {
      organizationId = org.id
    } else {
      const { data: membership, error: memErr } = await admin
        .from('organization_members')
        .select('organization_id, role, status, organizations!inner(plan)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .in('role', ['owner', 'admin'])
        .maybeSingle()
      if (memErr) throw memErr
      if (!membership) return json({ error: 'Only an owner or admin can invite teammates' }, 403)
      organizationId = membership.organization_id as string
    }

    const { data: orgRow, error: orgRowErr } = await admin
      .from('organizations')
      .select('plan')
      .eq('id', organizationId)
      .single()
    if (orgRowErr) throw orgRowErr
    if (orgRow.plan !== 'team') {
      return json({ error: 'Upgrade to the Team plan before inviting teammates' }, 403)
    }

    let invitedUserId: string
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email)
    if (inviteErr) {
      // Supabase's shared email sender has a strict per-project rate limit —
      // surface this distinctly so the UI can explain it instead of showing
      // a generic 500 (fix requires configuring custom SMTP in the dashboard).
      if (inviteErr.status === 429 || inviteErr.code === 'over_email_send_rate_limit') {
        return json({ error: 'Too many invite emails sent recently — please try again in a few minutes.' }, 429)
      }
      // The invitee may already have a DigiPromix account (personal or from
      // another business). inviteUserByEmail can't be used for an existing
      // user, so look their id up and link them to this business directly —
      // they just log in as normal to pick up access.
      if (inviteErr.status === 422 || inviteErr.code === 'email_exists') {
        const lookupRes = await fetch(
          `${Deno.env.get('SUPABASE_URL')!}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
          {
            headers: {
              apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
            },
          },
        )
        const lookupBody = await lookupRes.json().catch(() => null)
        const existingUser = lookupBody?.users?.[0]
        if (!lookupRes.ok || !existingUser) {
          return json({ error: 'A user with this email already exists but could not be looked up' }, 500)
        }
        invitedUserId = existingUser.id
      } else {
        throw inviteErr
      }
    } else {
      invitedUserId = invited.user.id
    }

    const { data: member, error: memberInsertErr } = await admin
      .from('organization_members')
      .upsert(
        {
          organization_id: organizationId,
          user_id: invitedUserId,
          email,
          role,
          status: 'pending',
          invited_by: user.id,
        },
        { onConflict: 'organization_id,email' }
      )
      .select()
      .single()
    if (memberInsertErr) throw memberInsertErr

    return json({ success: true, member })
  } catch (err) {
    console.error('invite-team-member error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
