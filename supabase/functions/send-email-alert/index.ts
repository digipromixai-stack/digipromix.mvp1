import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not configured — skipping')
    return jsonResponse({ sent: 0, failed: 0, skipped: 1 })
  }

  const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.digipromix.com'
  const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'alerts@digipromix.com'

  const { data: pendingAlerts, error } = await supabaseAdmin
    .from('alerts')
    .select(`
      id, user_id, change_id,
      detected_changes(
        id, title, description, change_type, severity, detected_at,
        competitor_id,
        competitors(name, website_url),
        monitored_pages(url, page_type)
      )
    `)
    .eq('channel', 'email')
    .eq('status', 'pending')
    .limit(50)

  if (error) return jsonResponse({ error: error.message }, 500)
  if (!pendingAlerts || pendingAlerts.length === 0) return jsonResponse({ sent: 0, failed: 0 })

  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
  const userEmailMap = new Map(users.map((u) => [u.id, u.email]))

  let sent = 0, failed = 0

  for (const alert of pendingAlerts) {
    const userEmail = userEmailMap.get(alert.user_id)
    if (!userEmail) continue

    const change = alert.detected_changes as {
      id: string; title: string; description: string
      change_type: string; severity: string; detected_at: string
      competitor_id: string
      competitors: { name: string; website_url: string }
      monitored_pages: { url: string; page_type: string }
    }

    const severityColor = change.severity === 'high' ? '#ef4444' : change.severity === 'medium' ? '#f59e0b' : '#6b7280'
    const dashboardUrl = `${APP_URL}/timeline/${change.competitor_id}`

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
    <div style="background: #1e40af; padding: 24px; color: white;">
      <h1 style="margin: 0; font-size: 18px;">Digipromix Alert</h1>
      <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">Competitor activity detected</p>
    </div>
    <div style="padding: 24px;">
      <div style="display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: ${severityColor}20; color: ${severityColor}; margin-bottom: 16px; text-transform: uppercase;">
        ${change.severity} severity · ${change.change_type.replace(/_/g, ' ')}
      </div>
      <h2 style="margin: 0 0 8px; font-size: 16px; color: #111827;">${change.title}</h2>
      ${change.description ? `<p style="color: #6b7280; font-size: 14px; margin: 0 0 16px;">${change.description}</p>` : ''}
      <div style="background: #f3f4f6; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 13px; color: #374151;"><strong>Competitor:</strong> ${change.competitors?.name ?? 'Unknown'}</p>
        <p style="margin: 4px 0 0; font-size: 13px; color: #374151;"><strong>Page:</strong> ${change.monitored_pages?.url ?? 'Unknown'}</p>
        <p style="margin: 4px 0 0; font-size: 13px; color: #374151;"><strong>Detected:</strong> ${new Date(change.detected_at).toLocaleString()}</p>
      </div>
      <a href="${dashboardUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500;">View in Dashboard</a>
    </div>
    <div style="border-top: 1px solid #e5e7eb; padding: 16px 24px; background: #f9fafb;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        You're receiving this because you have email alerts enabled.
        <a href="${APP_URL}/settings" style="color: #6b7280;">Manage preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`

    try {
      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: userEmail, subject: `Alert: ${change.title}`, html }),
      })
      if (res.ok) {
        await supabaseAdmin.from('alerts').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', alert.id)
        sent++
      } else {
        await supabaseAdmin.from('alerts').update({ status: 'failed' }).eq('id', alert.id)
        console.error(`[email] Failed for alert ${alert.id}:`, await res.text())
        failed++
      }
    } catch (err) {
      await supabaseAdmin.from('alerts').update({ status: 'failed' }).eq('id', alert.id)
      console.error(`[email] Exception for alert ${alert.id}:`, err)
      failed++
    }
  }

  return jsonResponse({ sent, failed })
})
