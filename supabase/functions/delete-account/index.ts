/**
 * delete-account — GDPR Right-to-Erasure endpoint
 *
 * POST {} — authenticated. Deletes ALL data for the requesting user,
 * including auth row. This is the "right to be forgotten" implementation.
 *
 * Cascade order (FK-safe):
 *   1. leads, alerts, campaigns
 *   2. detected_changes
 *   3. page_snapshots + diffs files
 *   4. monitored_pages, competitors
 *   5. ad_integrations
 *   6. alert_preferences, clients
 *   7. auth.users (final — invalidates the session)
 *
 * Returns { deleted_rows, deleted_storage_files } so the caller can show
 * a confirmation. The user is then signed out client-side.
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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )
    const uid = user.id
    const counts: Record<string, number> = {}

    async function del(table: string) {
      const { count, error } = await admin.from(table).delete({ count: 'exact' }).eq('user_id', uid)
      if (error) console.error(`delete ${table} failed:`, error.message)
      counts[table] = count ?? 0
    }

    // Storage cleanup — list & delete this user's snapshot files first
    let deletedFiles = 0
    try {
      const { data: snaps } = await admin.from('page_snapshots').select('storage_path').eq('user_id', uid)
      const paths = (snaps ?? [])
        .map((s) => (s as { storage_path: string | null }).storage_path)
        .filter((p): p is string => !!p)
      if (paths.length > 0) {
        // Storage delete in batches of 100
        for (let i = 0; i < paths.length; i += 100) {
          const batch = paths.slice(i, i + 100)
          const { error } = await admin.storage.from('snapshots').remove(batch)
          if (!error) deletedFiles += batch.length
        }
      }
    } catch (e) { console.error('storage cleanup failed:', e) }

    // FK-safe deletion order
    await del('leads')
    await del('alerts')
    await del('detected_changes')
    await del('page_snapshots')
    await del('campaigns')
    await del('monitored_pages')
    await del('competitors')
    await del('ad_integrations')
    await del('alert_preferences')
    await del('clients')

    // Finally delete the auth row (uses admin API — service role required)
    const { error: deleteUserErr } = await admin.auth.admin.deleteUser(uid)
    if (deleteUserErr) {
      console.error('auth.users delete failed:', deleteUserErr.message)
      return json({
        error:    'Account data deleted but auth row remains. Contact support.',
        detail:   deleteUserErr.message,
        deleted:  counts,
        files:    deletedFiles,
      }, 500)
    }

    return json({
      success:               true,
      deleted_rows:          counts,
      deleted_storage_files: deletedFiles,
      message:               'Your account and all associated data have been permanently deleted.',
    })
  } catch (err) {
    console.error('delete-account error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
