/**
 * manage-meta-campaign Edge Function
 *
 * POST { campaign_id, action }
 * action: "pause" | "enable" | "delete"
 *
 * Syncs the action to Meta (Facebook) Marketing API v19 for the campaign,
 * ad set, and ad associated with the campaign.
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

async function metaPost(path: string, token: string, payload: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  return res.json()
}

async function metaDelete(path: string, token: string) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  })
  return res.json()
}

function isTokenExpired(err: { code?: number }): boolean {
  return err.code === 190 || err.code === 102
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

    const { campaign_id, action } = await req.json()
    if (!campaign_id) return json({ error: 'campaign_id required' }, 400)
    if (!['pause', 'enable', 'delete'].includes(action)) {
      return json({ error: 'action must be: pause | enable | delete' }, 400)
    }

    // Fetch campaign
    const { data: campaign, error: campErr } = await admin
      .from('campaigns').select('*')
      .eq('id', campaign_id).eq('user_id', user.id).single()
    if (campErr || !campaign) return json({ error: 'Campaign not found' }, 404)

    const metaCampaignId = campaign.meta_campaign_id as string | null
    const metaAdsetId    = campaign.meta_adset_id as string | null
    const metaAdId       = campaign.meta_ad_id as string | null

    // No Meta link — just update DB
    if (!metaCampaignId) {
      if (action === 'delete') {
        await admin.from('campaigns').delete().eq('id', campaign_id)
        return json({ success: true, message: 'Campaign deleted (no Meta campaign linked)' })
      }
      const dbStatus = action === 'pause' ? 'paused' : 'active'
      await admin.from('campaigns').update({ status: dbStatus }).eq('id', campaign_id)
      return json({ success: true, message: `Campaign ${action}d (no Meta campaign linked)` })
    }

    // Fetch Meta integration
    const { data: integration, error: intErr } = await admin
      .from('ad_integrations').select('*')
      .eq('user_id', user.id).eq('platform', 'meta').eq('is_active', true).single()
    if (intErr || !integration) return json({ error: 'Meta account not connected. Please reconnect in Settings.' }, 400)

    const token = integration.access_token as string
    const errors: string[] = []

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      // Delete in reverse: Ad → AdSet → Campaign
      if (metaAdId) {
        const r = await metaDelete(`/${metaAdId}`, token)
        if (r.error) {
          if (isTokenExpired(r.error)) {
            await admin.from('ad_integrations').update({ is_active: false }).eq('id', integration.id)
            return json({ error: 'Meta token expired. Please reconnect in Settings.' }, 401)
          }
          errors.push(`Ad: ${r.error.message}`)
        }
      }
      if (metaAdsetId) {
        const r = await metaDelete(`/${metaAdsetId}`, token)
        if (r.error && !isTokenExpired(r.error)) errors.push(`AdSet: ${r.error.message}`)
      }
      const r = await metaDelete(`/${metaCampaignId}`, token)
      if (r.error && !isTokenExpired(r.error)) errors.push(`Campaign: ${r.error.message}`)

      // Always delete from DB
      await admin.from('campaigns').delete().eq('id', campaign_id)

      if (errors.length > 0) {
        return json({ success: true, warnings: errors, message: 'Deleted from app. Some Meta objects may need manual removal.' })
      }
      return json({ success: true, message: 'Campaign deleted from Meta and app.' })
    }

    // ── PAUSE / ENABLE ────────────────────────────────────────────────────────
    const metaStatus = action === 'pause' ? 'PAUSED' : 'ACTIVE'
    const dbStatus   = action === 'pause' ? 'paused' : 'active'

    // Update Campaign
    const cRes = await metaPost(`/${metaCampaignId}`, token, { status: metaStatus })
    if (cRes.error) {
      if (isTokenExpired(cRes.error)) {
        await admin.from('ad_integrations').update({ is_active: false }).eq('id', integration.id)
        return json({ error: 'Meta token expired. Please reconnect in Settings.' }, 401)
      }
      errors.push(`Campaign: ${cRes.error.message}`)
    }

    // Update AdSet
    if (metaAdsetId) {
      const aRes = await metaPost(`/${metaAdsetId}`, token, { status: metaStatus })
      if (aRes.error && !isTokenExpired(aRes.error)) errors.push(`AdSet: ${aRes.error.message}`)
    }

    // Update Ad
    if (metaAdId) {
      const adRes = await metaPost(`/${metaAdId}`, token, { status: metaStatus })
      if (adRes.error && !isTokenExpired(adRes.error)) errors.push(`Ad: ${adRes.error.message}`)
    }

    if (errors.length > 0) {
      return json({ success: false, errors, message: 'Meta update failed — status unchanged.' }, 400)
    }

    // Only update DB after Meta calls succeed
    await admin.from('campaigns').update({ status: dbStatus }).eq('id', campaign_id)

    return json({
      success: true,
      message: `Campaign ${action === 'pause' ? 'paused' : 'enabled'} in Meta and app.`,
    })

  } catch (err) {
    console.error(err)
    return json({ error: 'Internal server error' }, 500)
  }
})
