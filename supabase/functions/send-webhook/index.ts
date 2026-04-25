/**
 * send-webhook Edge Function
 *
 * Fires a JSON POST to the user's configured webhook URL when a change is detected.
 *
 * POST { change_id, user_id }   (called internally from detect-changes or alerting pipeline)
 * or
 * POST { change_id }            (called with user JWT — extracts user_id from token)
 *
 * Payload sent to webhook:
 * {
 *   change_type, severity, title, description,
 *   competitor, url, detected_at, campaign_count
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    // Resolve user_id — either from body (internal call) or JWT
    const body = await req.json()
    let { change_id, user_id } = body as { change_id?: string; user_id?: string }

    if (!user_id) {
      const authHeader = req.headers.get('Authorization') ?? ''
      if (authHeader) {
        const userClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: authHeader } } },
        )
        const { data: { user } } = await userClient.auth.getUser()
        user_id = user?.id
      }
    }

    if (!change_id) return json({ error: 'change_id is required' }, 400)
    if (!user_id)   return json({ error: 'Unauthorized' }, 401)

    // Load webhook preferences
    const { data: prefs } = await admin
      .from('alert_preferences')
      .select('webhook_url, webhook_enabled')
      .eq('user_id', user_id)
      .single()

    if (!prefs?.webhook_enabled || !prefs.webhook_url) {
      return json({ skipped: true, reason: 'Webhook not enabled or URL not set' })
    }

    // Load change details
    const { data: change, error: changeErr } = await admin
      .from('detected_changes')
      .select(`
        id, change_type, severity, title, description, detected_at,
        competitors ( name, website_url ),
        monitored_pages ( url )
      `)
      .eq('id', change_id)
      .single()

    if (changeErr || !change) return json({ error: 'Change not found' }, 404)

    // Count how many campaigns have been created for this change
    const { count: campaignCount } = await admin
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('change_id', change_id)

    const competitor = change.competitors as { name: string; website_url: string } | null
    const page       = change.monitored_pages as { url: string } | null

    const payload = {
      change_type:    change.change_type,
      severity:       change.severity,
      title:          change.title,
      description:    change.description ?? null,
      competitor:     competitor?.name    ?? null,
      competitor_url: competitor?.website_url ?? null,
      page_url:       page?.url           ?? null,
      detected_at:    change.detected_at,
      campaign_count: campaignCount ?? 0,
    }

    // POST to webhook (with 10s timeout)
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10_000)

    let webhookStatus: number
    try {
      const res = await fetch(prefs.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Digipromix-Event': 'competitor_change' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      webhookStatus = res.status
    } finally {
      clearTimeout(timeoutId)
    }

    if (webhookStatus < 200 || webhookStatus >= 300) {
      console.error('Webhook returned non-2xx:', webhookStatus)
      return json({ success: false, webhook_status: webhookStatus })
    }

    return json({ success: true, webhook_status: webhookStatus })
  } catch (err) {
    console.error('send-webhook error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
