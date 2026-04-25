/**
 * submit-lead Edge Function  (public — no JWT required)
 *
 * POST { slug, name?, email?, phone?, message? }
 *
 * Saves a lead from a public landing page.
 * - Looks up campaign by slug (must be published)
 * - Inserts into leads table
 * - Increments campaign.leads_count
 * - Sends WhatsApp alert via Twilio (if owner has number configured)
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

function scoreLeadSimple(name: string | null, email: string | null, phone: string | null, message: string | null): number {
  let s = 30 // base
  if (name?.trim())    s += 10
  if (email?.trim())   s += 25
  if (phone?.trim())   s += 30
  if (message?.trim()) s += 15
  return Math.min(s, 100)
}

async function sendWhatsApp(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string,
) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  })
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const body = await req.json()
    const { slug, name = null, email = null, phone = null, message = null } = body

    if (!slug) return json({ error: 'slug is required' }, 400)
    if (!name && !email && !phone) return json({ error: 'At least name, email or phone is required' }, 400)

    // Fetch campaign by slug (must be published)
    const { data: campaign, error: campErr } = await admin
      .from('campaigns')
      .select('id, user_id, campaign_name, competitor_name, competitor_id, published')
      .eq('slug', slug)
      .eq('published', true)
      .single()

    if (campErr || !campaign) return json({ error: 'Landing page not found' }, 404)

    const score = scoreLeadSimple(name, email, phone, message)

    // Insert lead
    const { data: lead, error: insertErr } = await admin
      .from('leads')
      .insert({
        user_id:       campaign.user_id,
        campaign_id:   campaign.id,
        competitor_id: campaign.competitor_id ?? null,
        name,
        email,
        phone,
        message,
        source:        'landing_page',
        score,
        status:        'new',
      })
      .select()
      .single()

    if (insertErr || !lead) {
      console.error('Lead insert error:', insertErr)
      return json({ error: 'Failed to save lead' }, 500)
    }

    // Increment leads_count (read-then-write, best-effort)
    const { data: campData } = await admin
      .from('campaigns')
      .select('leads_count')
      .eq('id', campaign.id)
      .single()
    if (campData) {
      await admin
        .from('campaigns')
        .update({ leads_count: (campData.leads_count ?? 0) + 1 })
        .eq('id', campaign.id)
    }

    // Send WhatsApp alert (best-effort, fail-soft)
    try {
      const { data: prefs } = await admin
        .from('alert_preferences')
        .select('whatsapp_number, whatsapp_alerts')
        .eq('user_id', campaign.user_id)
        .single()

      if (prefs?.whatsapp_alerts && prefs.whatsapp_number) {
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
        const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')
        const fromNum    = Deno.env.get('TWILIO_WHATSAPP_NUMBER') ?? 'whatsapp:+14155238886'

        if (accountSid && authToken) {
          const toNum = prefs.whatsapp_number.startsWith('whatsapp:')
            ? prefs.whatsapp_number
            : `whatsapp:${prefs.whatsapp_number}`

          const msgBody = [
            `🔥 New Lead! (Score: ${score}%)`,
            `Campaign: ${campaign.campaign_name}`,
            name    ? `Name: ${name}`    : null,
            email   ? `Email: ${email}`  : null,
            phone   ? `Phone: ${phone}`  : null,
            message ? `Message: ${message}` : null,
          ].filter(Boolean).join('\n')

          const wa = await sendWhatsApp(accountSid, authToken, fromNum, toNum, msgBody)
          if (wa.error_code) console.error('Twilio error:', wa.error_code, wa.message)
        }
      }
    } catch (waErr) {
      console.error('WhatsApp alert failed (non-critical):', waErr)
    }

    return json({ success: true, lead_id: lead.id, score })
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
