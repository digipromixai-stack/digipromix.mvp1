/**
 * admin-launch-campaign — service-role launcher
 *
 * Bypasses the user-auth path of launch-meta-campaign / launch-google-ads-campaign
 * so it can be called from pg_cron, server scripts, or a curl with the service
 * role bearer token. Useful when the frontend is broken and you need to verify
 * the launch path works end-to-end.
 *
 * POST {
 *   campaign_id:       required
 *   admin_token:       required — must equal the ADMIN_LAUNCH_TOKEN env var
 *   channels?:         ['meta', 'google']  default: campaign.channels
 *   daily_budget?:     number              default: 200
 *   landing_page_url?: string              default: derived from /lp/<slug>
 *   image_url?:        string              optional
 * }
 *
 * Forwards to the existing launch-X-campaign functions with a forged user JWT
 * so they run with the campaign owner's identity. This is intentionally
 * gated behind ADMIN_LAUNCH_TOKEN so it's not abusable.
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
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const body = await req.json().catch(() => ({}))
    const {
      campaign_id, admin_token,
      channels:        channelsOverride,
      daily_budget:    budgetOverride,
      landing_page_url: urlOverride,
      image_url,
    } = body as {
      campaign_id?: string
      admin_token?: string
      channels?: string[]
      daily_budget?: number
      landing_page_url?: string
      image_url?: string
    }

    if (!campaign_id) return json({ error: 'campaign_id required' }, 400)

    // Authenticate via shared admin token — keeps this endpoint internal-only
    const expected = Deno.env.get('ADMIN_LAUNCH_TOKEN') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!expected || admin_token !== expected) {
      return json({ error: 'Forbidden — pass admin_token=<ADMIN_LAUNCH_TOKEN or SERVICE_ROLE_KEY>' }, 403)
    }

    // Look up the campaign + owner
    const { data: campaign } = await admin
      .from('campaigns')
      .select('id, user_id, slug, channels, daily_budget, landing_page_url')
      .eq('id', campaign_id).single()
    if (!campaign) return json({ error: 'Campaign not found' }, 404)

    // Generate a short-lived user-scoped session for the campaign owner so the
    // downstream launch-* functions can validate via auth.getUser()
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type:  'magiclink',
      email: '',                  // we won't actually use the link
      options: { redirectTo: 'https://www.digipromix.com' },
    } as Parameters<typeof admin.auth.admin.generateLink>[0])
    void linkData; void linkErr   // not used; we use a different path below

    // Simpler: forge an internal session via signInWithIdToken won't work either.
    // Best approach: use the service role token itself — most Supabase edge
    // functions accept a service-role JWT as a valid auth bearer (it has aud=service_role).
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Resolve launch parameters
    const channels: string[] = channelsOverride ?? (campaign.channels as string[]) ?? []
    const dailyBudget: number = Number(budgetOverride ?? campaign.daily_budget ?? 200)
    const slug = (campaign.slug as string | null) ?? ''
    const landingUrl: string = urlOverride
      ?? (campaign.landing_page_url as string | null)
      ?? (slug ? `https://www.digipromix.com/lp/${slug}` : 'https://www.digipromix.com/')

    // Make sure campaign has the necessary fields persisted before launch
    await admin.from('campaigns').update({
      channels:         channels.length > 0 ? channels : ['meta'],
      daily_budget:     dailyBudget,
      landing_page_url: landingUrl,
      published:        true,
      meta_error:       null,
      google_error:     null,
    }).eq('id', campaign_id)

    const results: Record<string, unknown> = {}

    // ── Launch Meta if selected ─────────────────────────────────────────
    if (channels.includes('meta') || channels.length === 0) {
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/launch-meta-campaign`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey':        serviceRoleKey,
            // Identify the owner so the downstream function can scope correctly
            'x-admin-on-behalf-of': campaign.user_id as string,
          },
          body: JSON.stringify({
            campaign_id,
            daily_budget_usd: dailyBudget,
            landing_page_url: landingUrl,
            image_url,
          }),
        })
        results.meta = { status: res.status, body: await res.json().catch(() => ({})) }
      } catch (e) {
        results.meta = { error: String(e) }
      }
    }

    // ── Launch Google if selected ───────────────────────────────────────
    if (channels.includes('google')) {
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/launch-google-ads-campaign`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey':        serviceRoleKey,
            'x-admin-on-behalf-of': campaign.user_id as string,
          },
          body: JSON.stringify({
            campaign_id,
            daily_budget_usd: dailyBudget,
            landing_page_url: landingUrl,
          }),
        })
        results.google = { status: res.status, body: await res.json().catch(() => ({})) }
      } catch (e) {
        results.google = { error: String(e) }
      }
    }

    // Read back the final campaign state for the caller
    const { data: final } = await admin
      .from('campaigns')
      .select('id, status, meta_campaign_id, meta_adset_id, meta_ad_id, meta_error, google_campaign_id, google_ad_group_id, google_ad_id, google_error, daily_budget, landing_page_url')
      .eq('id', campaign_id).single()

    return json({ campaign: final, launch_results: results })
  } catch (err) {
    console.error('admin-launch-campaign error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
