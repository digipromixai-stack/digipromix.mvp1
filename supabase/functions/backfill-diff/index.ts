// One-shot backfill: regenerate the diff blob in Storage for changes whose
// snapshots are gzip-compressed (.html.gz) but whose diff was written before
// detect-changes learned to decompress gzip. Updates the existing diff file
// at change.diff_storage_path in place — no new detected_changes rows, no
// email alerts.
//
// POST /functions/v1/backfill-diff
//   { "change_id": "<uuid>" }  → backfills one
//   { "all_gzipped": true   }  → backfills every change whose snapshot paths end in .gz
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractNormalizedLines } from '../_shared/htmlExtractor.ts'
import { bestDiff, formatDiffAsText } from '../_shared/diffGenerator.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function blobToHtml(blob: Blob, path: string): Promise<string> {
  if (path.endsWith('.gz')) {
    const ds   = new DecompressionStream('gzip')
    const buf  = await new Response(blob.stream().pipeThrough(ds)).arrayBuffer()
    return new TextDecoder('utf-8').decode(buf)
  }
  return blob.text()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  let body: { change_id?: string; all_gzipped?: boolean } = {}
  try { body = await req.json() } catch { /* ok if empty */ }

  // Pick the set of changes to backfill
  let changeIds: string[] = []
  if (body.change_id) {
    changeIds = [body.change_id]
  } else if (body.all_gzipped) {
    const { data, error } = await admin
      .from('detected_changes')
      .select('id, snapshot_before, snapshot_after, diff_storage_path, page_snapshots!detected_changes_snapshot_after_fkey(storage_path)')
      .not('diff_storage_path', 'is', null)
    if (error) return json({ error: error.message }, 500)
    // Filter to ones whose after-snapshot path ends in .gz
    changeIds = (data ?? [])
      .filter((r: any) => r.page_snapshots?.storage_path?.endsWith('.gz'))
      .map((r: any) => r.id)
  } else {
    return json({ error: 'Pass {change_id} or {all_gzipped:true}' }, 400)
  }

  const results: Array<{ change_id: string; ok: boolean; msg?: string }> = []

  for (const id of changeIds) {
    try {
      const { data: change, error: cErr } = await admin
        .from('detected_changes')
        .select('id, snapshot_before, snapshot_after, diff_storage_path')
        .eq('id', id)
        .single()
      if (cErr || !change) { results.push({ change_id: id, ok: false, msg: 'change not found' }); continue }
      if (!change.snapshot_before || !change.snapshot_after || !change.diff_storage_path) {
        results.push({ change_id: id, ok: false, msg: 'missing snapshot or diff path' }); continue
      }

      const [bs, as_] = await Promise.all([
        admin.from('page_snapshots').select('storage_path').eq('id', change.snapshot_before).single(),
        admin.from('page_snapshots').select('storage_path').eq('id', change.snapshot_after ).single(),
      ])
      const beforePath = bs.data?.storage_path
      const afterPath  = as_.data?.storage_path
      if (!beforePath || !afterPath) {
        results.push({ change_id: id, ok: false, msg: 'snapshot path missing' }); continue
      }

      const [bFile, aFile] = await Promise.all([
        admin.storage.from('snapshots').download(beforePath),
        admin.storage.from('snapshots').download(afterPath),
      ])
      if (bFile.error || aFile.error) {
        results.push({ change_id: id, ok: false, msg: 'download failed' }); continue
      }

      const beforeHtml = await blobToHtml(bFile.data!, beforePath)
      const afterHtml  = await blobToHtml(aFile.data!,  afterPath)
      const beforeLines = extractNormalizedLines(beforeHtml)
      const afterLines  = extractNormalizedLines(afterHtml)

      const diffText = formatDiffAsText(bestDiff(beforeLines, afterLines))

      const upload = await admin.storage
        .from('diffs')
        .upload(change.diff_storage_path, diffText, { contentType: 'text/plain', upsert: true })
      if (upload.error) {
        results.push({ change_id: id, ok: false, msg: upload.error.message }); continue
      }

      results.push({ change_id: id, ok: true, msg: `${diffText.length} chars` })
    } catch (e) {
      results.push({ change_id: id, ok: false, msg: String(e) })
    }
  }

  return json({ processed: results.length, results })
})
