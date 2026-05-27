// One-shot backfill: for changes whose snapshots are gzip-compressed
// (.html.gz) but whose diff + metadata were written BEFORE detect-changes
// learned to decompress gzip, regenerate two things:
//   1. The diff blob in Storage at change.diff_storage_path (text/plain)
//   2. The row's metadata JSON (so 'Jump to change' deep-link picks a real
//      readable snippet instead of garbage like ["$1","$9"])
//
// We do NOT touch title/description (those came from Gemini AI and are fine),
// we do NOT create new detected_changes rows, we do NOT fire email alerts.
//
// POST /functions/v1/backfill-diff
//   { "change_id": "<uuid>" }  → backfills one
//   { "all_gzipped": true   }  → backfills every change whose snapshot paths end in .gz
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractNormalizedLines } from '../_shared/htmlExtractor.ts'
import { bestDiff, formatDiffAsText } from '../_shared/diffGenerator.ts'
import { classifyChange } from '../_shared/changeClassifier.ts'

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
        .select('id, snapshot_before, snapshot_after, diff_storage_path, monitored_page_id, metadata')
        .eq('id', id)
        .single()
      if (cErr || !change) { results.push({ change_id: id, ok: false, msg: 'change not found' }); continue }
      if (!change.snapshot_before || !change.snapshot_after || !change.diff_storage_path) {
        results.push({ change_id: id, ok: false, msg: 'missing snapshot or diff path' }); continue
      }

      // Need the page URL for classifier (it uses url to detect landing-page vs blog)
      const { data: page } = await admin
        .from('monitored_pages')
        .select('url')
        .eq('id', change.monitored_page_id)
        .single()
      const pageUrl = page?.url ?? ''

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

      // 1. Regenerate diff blob
      const diffText = formatDiffAsText(bestDiff(beforeLines, afterLines))
      const upload = await admin.storage
        .from('diffs')
        .upload(change.diff_storage_path, diffText, { contentType: 'text/plain', upsert: true })
      if (upload.error) {
        results.push({ change_id: id, ok: false, msg: 'diff upload: ' + upload.error.message }); continue
      }

      // 2. Re-classify on decompressed HTML so metadata has readable snippets
      const cls = classifyChange(beforeHtml, afterHtml, pageUrl, beforeLines, afterLines)

      // Compute added/removed content by diffing line sets (real readable text).
      // These power the "Jump to change" deep-link anchor.
      const beforeSet = new Set(beforeLines.map(l => l.trim()).filter(l => l.length > 4))
      const addedContent = afterLines
        .map(l => l.trim())
        .filter(l => l.length > 4 && l.length < 200 && !beforeSet.has(l))
        .slice(0, 10)
      const afterSet = new Set(afterLines.map(l => l.trim()).filter(l => l.length > 4))
      const removedContent = beforeLines
        .map(l => l.trim())
        .filter(l => l.length > 4 && l.length < 200 && !afterSet.has(l))
        .slice(0, 10)

      // Preserve fields we don't recompute (ai_enhanced flag, action_recommended if it came from AI)
      const oldMeta = (change.metadata ?? {}) as Record<string, unknown>
      const newMeta = {
        ...oldMeta,
        price_before:        cls.price_before        ?? [],
        price_after:         cls.price_after         ?? [],
        promo_keywords:      cls.promo_keywords      ?? [],
        promo_codes:         cls.promo_codes         ?? [],
        added_content:       addedContent,
        removed_content:     removedContent,
        campaign_score:      cls.campaign_score      ?? oldMeta.campaign_score ?? null,
        is_coordinated:      cls.is_coordinated      ?? oldMeta.is_coordinated ?? false,
        // Keep AI-derived fields untouched if present
        action_recommended:  oldMeta.action_recommended ?? cls.action_recommended ?? null,
        price_change_detail: typeof oldMeta.price_change_detail === 'string' && oldMeta.price_change_detail
          ? oldMeta.price_change_detail
          : '',
        backfilled_at:       new Date().toISOString(),
      }

      const { error: updErr } = await admin
        .from('detected_changes')
        .update({ metadata: newMeta })
        .eq('id', id)
      if (updErr) {
        results.push({ change_id: id, ok: false, msg: 'metadata update: ' + updErr.message }); continue
      }

      results.push({
        change_id: id,
        ok: true,
        msg: `diff ${diffText.length}c · added ${addedContent.length} · prices ${(cls.price_after ?? []).length}`,
      })
    } catch (e) {
      results.push({ change_id: id, ok: false, msg: String(e) })
    }
  }

  return json({ processed: results.length, results })
})
