/**
 * invite-team-member — creates/links the invited user and emails them via
 * the Gmail API (same sender as send-email-alert), bypassing Supabase Auth's
 * own mailer entirely so invites aren't subject to its strict rate limit.
 *
 * POST { email: string, role: 'admin' | 'member' } — authenticated.
 * Caller must be an active 'owner' or 'admin' of a 'team' plan organization.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendGmailEmail } from '../_shared/gmail.ts'

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
      .select('plan, name')
      .eq('id', organizationId)
      .single()
    if (orgRowErr) throw orgRowErr
    if (orgRow.plan !== 'team') {
      return json({ error: 'Upgrade to the Team plan before inviting teammates' }, 403)
    }

    const APP_URL = Deno.env.get('APP_URL') ?? 'https://www.digipromix.com'

    // generateLink (type: 'invite') creates the auth user and returns a
    // sign-up action link WITHOUT Supabase sending its own email — we send
    // the notification ourselves via Gmail below, so GoTrue's built-in
    // mailer (and its strict per-project rate limit) is never involved.
    let invitedUserId: string
    let actionLink: string | null = null
    let isNewUser = true

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${APP_URL}/login` },
    })

    if (linkErr) {
      // The invitee may already have a DigiPromix account (personal or from
      // another business) — generateLink's invite type only works for new
      // users. Look their id up and link them to this business directly;
      // they just log in as normal to pick up access.
      if (linkErr.status === 422 || linkErr.code === 'email_exists') {
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
        isNewUser = false
      } else {
        throw linkErr
      }
    } else {
      invitedUserId = linkData.user.id
      actionLink = linkData.properties?.action_link ?? null
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

    // Best-effort — membership is already created even if the email fails
    // to send (owner/admin can see the pending row and resend later).
    try {
      const ctaUrl = actionLink ?? `${APP_URL}/login`
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
    <div style="background: #1e40af; padding: 24px; color: white;">
      <h1 style="margin: 0; font-size: 18px;">You've been invited to ${orgRow.name}</h1>
    </div>
    <div style="padding: 24px;">
      <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">
        ${isNewUser
          ? `You've been invited to join ${orgRow.name} on DigiPromix AI as ${role === 'admin' ? 'an Admin' : 'a Member'}. Set up your account to get started.`
          : `You've been added to ${orgRow.name} on DigiPromix AI as ${role === 'admin' ? 'an Admin' : 'a Member'}. Log in with your existing account to access it.`}
      </p>
      <a href="${ctaUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500;">
        ${isNewUser ? 'Set up your account' : 'Sign in'}
      </a>
    </div>
  </div>
</body>
</html>`
      await sendGmailEmail({
        to: email,
        subject: `You've been invited to ${orgRow.name} on DigiPromix AI`,
        html,
        fromName: 'DigiPromix AI',
      })
    } catch (emailErr) {
      console.error('invite-team-member: email send failed (membership still created):', emailErr)
    }

    return json({ success: true, member })
  } catch (err) {
    console.error('invite-team-member error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
