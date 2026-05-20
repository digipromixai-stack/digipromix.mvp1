/**
 * cleanup-orphan-snapshots — maintenance function
 *
 * Deletes files in the `snapshots` storage bucket that have no
 * corresponding row in page_snapshots. These accumulate when the
 * Render Python crawler uploaded HTML but failed to insert the DB row
 * (the bug that was fixed by making storage_path nullable).
 *
 * POST {} — no body required. Returns { deleted, kept, errors }.
 *
 * Configured with verify_jwt=false so it can be invoked from pg_cron
 * or an authenticated user via curl with the service key.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

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

// Batch size for the storage list + delete operations. Storage limits
// recommend max 100 items per delete request.
const BATCH_SIZE = 100
const MAX_BATCHES_PER_RUN = 20   // cap at 2000 deletions per invocation

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Get all storage_path values referenced by page_snapshots
    const { data: referenced, error: refErr } = await supabaseAdmin
      .from('page_snapshots')
      .select('storage_path')
      .not('storage_path', 'is', null)

    if (refErr) return json({ error: refErr.message }, 500)

    const referencedSet = new Set(
      (referenced ?? []).map((r) => (r as { storage_path: string }).storage_path)
    )

    let totalDeleted = 0
    let totalKept    = 0
    let totalErrors  = 0
    const errorMsgs: string[] = []

    // Storage API doesn't have a "list all files" endpoint — we must
    // recurse into folders. We list at root first (gives us user_id
    // folders), then for each we recurse one level via list().
    async function listAllFiles(prefix = ''): Promise<string[]> {
      const out: string[] = []
      const { data, error } = await supabaseAdmin.storage
        .from('snapshots')
        .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
      if (error) {
        errorMsgs.push(`list ${prefix}: ${error.message}`)
        return out
      }
      for (const item of data ?? []) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name
        // Folders have null id and metadata
        if (item.id === null && !item.metadata) {
          const sub = await listAllFiles(fullPath)
          out.push(...sub)
        } else {
          out.push(fullPath)
        }
      }
      return out
    }

    const allFiles = await listAllFiles('')
    const orphans  = allFiles.filter((p) => !referencedSet.has(p))
    totalKept = allFiles.length - orphans.length

    // Delete orphans in batches
    for (let i = 0; i < orphans.length && i < BATCH_SIZE * MAX_BATCHES_PER_RUN; i += BATCH_SIZE) {
      const batch = orphans.slice(i, i + BATCH_SIZE)
      const { error: delErr } = await supabaseAdmin.storage
        .from('snapshots')
        .remove(batch)
      if (delErr) {
        errorMsgs.push(`delete batch ${i}: ${delErr.message}`)
        totalErrors += batch.length
      } else {
        totalDeleted += batch.length
      }
    }

    return json({
      deleted:      totalDeleted,
      kept:         totalKept,
      errors:       totalErrors,
      remaining:    orphans.length - totalDeleted,
      messages:     errorMsgs.slice(0, 5),
    })
  } catch (err) {
    console.error('cleanup-orphan-snapshots error:', err)
    return json({ error: 'Internal server error', detail: String(err) }, 500)
  }
})
