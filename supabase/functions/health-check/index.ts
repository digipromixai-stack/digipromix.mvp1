/**
 * health-check — MVP 2.0 monitoring endpoint
 *
 * GET / POST — returns { status, db, render, timestamp } for uptime
 * monitoring tools (BetterStack, UptimeRobot, etc.) and the in-app status page.
 *
 * Tests:
 *   - Supabase DB read (page_snapshots count)
 *   - Render Python crawler reachability
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const RENDER_HEALTH = 'https://44.222.116.245.nip.io/health'

async function checkRender(): Promise<{ ok: boolean; latency_ms: number | null; error?: string }> {
  const start = Date.now()
  try {
    const res = await fetch(RENDER_HEALTH, { signal: AbortSignal.timeout(5000) })
    return { ok: res.ok, latency_ms: Date.now() - start }
  } catch (err) {
    return { ok: false, latency_ms: null, error: err instanceof Error ? err.message : 'fetch failed' }
  }
}

async function checkDb(): Promise<{ ok: boolean; latency_ms: number | null; error?: string }> {
  const start = Date.now()
  try {
    const { error } = await supabaseAdmin
      .from('monitored_pages').select('id', { count: 'exact', head: true }).limit(1)
    if (error) return { ok: false, latency_ms: Date.now() - start, error: error.message }
    return { ok: true, latency_ms: Date.now() - start }
  } catch (err) {
    return { ok: false, latency_ms: null, error: err instanceof Error ? err.message : 'db failed' }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const [db, render] = await Promise.all([checkDb(), checkRender()])
  const ok = db.ok && render.ok

  return new Response(JSON.stringify({
    status:    ok ? 'healthy' : 'degraded',
    db,
    render,
    timestamp: new Date().toISOString(),
    version:   '2.0',
  }), {
    status: ok ? 200 : 503,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
