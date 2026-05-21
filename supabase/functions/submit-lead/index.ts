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

interface ScoringInput {
  name:    string | null
  email:   string | null
  phone:   string | null
  message: string | null
  // Engagement signals (MVP 2.0 Lead Intent Scoring)
  time_on_page_seconds: number | null
  scroll_depth_pct:     number | null
  click_count:          number | null
  utm_source:           string | null
  utm_medium:           string | null
  referrer:             string | null
}

/**
 * MVP 2.0 Lead Intent Scoring
 * Combines form quality with engagement signals + UTM context to classify
 * leads as HOT / MEDIUM / LOW. Output: { score: 0-100, score_type, recommended_action }
 */
function scoreLeadIntent(i: ScoringInput): { score: number; score_type: 'HOT' | 'MEDIUM' | 'LOW'; recommended_action: string } {
  let s = 0

  // ── Form quality (max 50) ──
  if (i.name?.trim())    s += 5
  if (i.email?.trim())   s += 15
  if (i.phone?.trim())   s += 20
  if (i.message?.trim()) s += 10

  // ── Engagement quality (max 30) ──
  const time = i.time_on_page_seconds ?? 0
  if (time >= 60)       s += 10                 // > 1 min = engaged
  else if (time >= 30)  s += 6
  else if (time >= 10)  s += 3

  const scroll = i.scroll_depth_pct ?? 0
  if (scroll >= 75)     s += 10                 // read most of the page
  else if (scroll >= 50) s += 6
  else if (scroll >= 25) s += 3

  const clicks = i.click_count ?? 0
  if (clicks >= 3)      s += 10                 // explored multiple CTAs
  else if (clicks >= 1) s += 5

  // ── Channel quality (max 20) ──
  // Paid traffic + branded referrals signal higher intent than organic strangers
  const src = (i.utm_source ?? '').toLowerCase()
  const med = (i.utm_medium ?? '').toLowerCase()
  if (med === 'cpc' || med === 'paid' || src === 'google' || src === 'meta' || src === 'facebook') s += 15
  else if (i.referrer?.trim())  s += 8           // referred from a known site
  else if (src)                 s += 5           // tagged organic

  s = Math.min(s, 100)

  let score_type: 'HOT' | 'MEDIUM' | 'LOW'
  let recommended_action: string
  if (s >= 70) {
    score_type = 'HOT'
    recommended_action = 'Contact within 5 minutes — high intent.'
  } else if (s >= 40) {
    score_type = 'MEDIUM'
    recommended_action = 'Follow up within 24 hours with personalised message.'
  } else {
    score_type = 'LOW'
    recommended_action = 'Add to nurture sequence — low immediate intent.'
  }

  return { score: s, score_type, recommended_action }
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
    const {
      slug, name = null, email = null, phone = null, message = null,
      // MVP 2.0 — engagement + attribution signals (all optional, frontend may omit)
      time_on_page_seconds = null,
      scroll_depth_pct     = null,
      click_count          = null,
      utm_source           = null,
      utm_medium           = null,
      utm_campaign         = null,
      utm_content          = null,
      utm_term             = null,
      referrer             = null,
    } = body

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

    const { score, score_type, recommended_action } = scoreLeadIntent({
      name, email, phone, message,
      time_on_page_seconds, scroll_depth_pct, click_count,
      utm_source, utm_medium, referrer,
    })

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
        score_type,
        recommended_action,
        time_on_page_seconds,
        scroll_depth_pct,
        click_count,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        referrer,
        status:        'new',
      })
      .select()
      .single()

    if (insertErr || !lead) {
      console.error('Lead insert error:', insertErr)
      return json({ error: 'Failed to save lead' }, 500)
    }

    // Atomic increment (avoids lost updates if multiple leads arrive simultaneously)
    const { error: incErr } = await admin
      .rpc('increment_campaign_leads_count', { campaign_id_param: campaign.id })
    if (incErr) console.error('leads_count increment failed (non-fatal):', incErr.message)

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
