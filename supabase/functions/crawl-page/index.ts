/**
 * crawl-page Edge Function — v13 (additional optimizations)
 *
 * On top of v12:
 *   6. Single-pass noise regex     → 5 separate strip passes → 1 (≈5× faster strip)
 *   7. markRunning folded into initial reads → 1 less DB round-trip
 *   8. Content-Type early bail     → skip parsing when non-HTML returned
 *   9. prices_json as native array → JSONB instead of stringified text
 *  10. Gzip HTML before storage    → ≈80% smaller payload, faster upload
 *  11. Module-level TextEncoder    → no per-call allocations during hashing
 *  12. Storage upload is best-effort — snapshot row still inserted with null
 *      storage_path if upload fails (detect-changes falls back to normalized_text)
 *
 * Earlier (v12):
 *   1. Conditional GET via stored ETag / Last-Modified  → 304 short-circuits
 *   2. 5 MB body cap with streaming read                → prevents OOM
 *   3. Parallel initial DB reads                        → fewer round-trips
 *   4. Combined no-change writes via Promise.all
 *   5. Tracks fetch_ms + content_size in page_snapshots
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

// Anti-bot sites (Media Markt, Zalando, Saturn) sometimes hold the connection
// open without ever responding, eating the full timeout. 12s × 1 retry + small
// backoff fits inside the Supabase Edge Function 25s wall budget and prevents
// "running" jobs hanging until the 5-min cron expiry sweeps them.
const CRAWL_TIMEOUT_MS = 12_000
const MAX_RETRIES      = 1
const MAX_BODY_BYTES   = 5 * 1024 * 1024
const ENCODER          = new TextEncoder()

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
]

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

// ── HTML extraction ─────────────────────────────────────────────────────────
// Combined noise stripping into ONE regex pass instead of five sequential ones.
// Each replace() previously allocated a new string of the entire HTML — with
// 5 passes on a 1 MB page that's ~5 MB of intermediate string allocations.
const NOISE_RE = /<(?:script|style|noscript|svg)(?:\s[^>]*)?>[\s\S]*?<\/(?:script|style|noscript|svg)>|<!--[\s\S]*?-->/gi
const PRICE_REGEX = /(?:[\$€£¥][\d,]+\.?\d{0,2}|\d+[.,]\d{2}\s*(?:USD|EUR|GBP|CAD|AUD))/g

function stripNoise(html: string): string { return html.replace(NOISE_RE, ' ') }

function extractText(stripped: string): string {
  return stripped.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

function extractNormalizedLines(stripped: string): string[] {
  return stripped
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 2)
}

function extractPrices(text: string): string[] {
  return [...new Set(text.match(PRICE_REGEX) ?? [])]
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1])
      const items = Array.isArray(parsed) ? parsed : [parsed]
      results.push(...items)
    } catch { /* skip */ }
  }
  return results
}

function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {}
  const re1 = /<meta\s+(?:[^>]*?\s)?(?:name|property)=["']([^"']+)["'][^>]*\s+content=["']([^"']+)["'][^>]*>/gi
  let m
  while ((m = re1.exec(html)) !== null) meta[m[1].toLowerCase()] = m[2]
  const re2 = /<meta\s+content=["']([^"']+)["'][^>]*\s+(?:name|property)=["']([^"']+)["'][^>]*>/gi
  while ((m = re2.exec(html)) !== null) meta[m[2].toLowerCase()] = m[1]
  return meta
}

function extractByPageType(html: string, pageType: string): Record<string, unknown> {
  const base: Record<string, unknown> = { jsonLd: extractJsonLd(html), meta: extractMetaTags(html) }
  if (pageType === 'pricing') {
    const headings: string[] = []
    const tables: string[] = []
    let m
    const headingRe = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi
    while ((m = headingRe.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (text) headings.push(text)
    }
    const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi
    while ((m = tableRe.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (text.length > 10) tables.push(text)
    }
    return { ...base, headings, tables }
  }
  if (pageType === 'blog') {
    const publishDates: string[] = []
    let m
    const timeRe = /<time[^>]*datetime=["']([^"']+)["'][^>]*>/gi
    while ((m = timeRe.exec(html)) !== null) publishDates.push(m[1])
    return { ...base, publishDates }
  }
  return base
}

async function computeHash(text: string): Promise<string> {
  const data = ENCODER.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Gzip helper for storage upload ──────────────────────────────────────────
async function gzipString(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

// ── Body reader with size cap ───────────────────────────────────────────────
async function readBodyWithCap(response: Response): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const reader = response.body?.getReader()
  if (!reader) return { text: await response.text(), bytes: 0, truncated: false }

  const decoder = new TextDecoder('utf-8', { fatal: false })
  let total = 0
  let truncated = false
  const chunks: string[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      truncated = true
      try { await reader.cancel() } catch { /* ignore */ }
      break
    }
    chunks.push(decoder.decode(value, { stream: true }))
  }
  chunks.push(decoder.decode())
  return { text: chunks.join(''), bytes: total, truncated }
}

// ── Conditional fetch with retry + content-type guard ───────────────────────
async function fetchWithRetry(
  url: string,
  retries: number,
  conditional: { etag?: string | null; lastModified?: string | null },
): Promise<
  | { html: string; httpStatus: number; etag: string | null; lastModified: string | null; bytes: number; fetchMs: number; truncated: boolean; contentType: string | null }
  | { notModified: true; fetchMs: number }
  | { skipped: true; reason: string; contentType: string | null }
  | { error: string }
> {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
  let lastError = ''

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt))

    const headers: Record<string, string> = {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    }
    if (conditional.etag)         headers['If-None-Match']     = conditional.etag
    if (conditional.lastModified) headers['If-Modified-Since'] = conditional.lastModified

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS)
      const t0 = Date.now()
      const response = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' })
      clearTimeout(timeout)
      const fetchMs = Date.now() - t0

      if (response.status === 304) {
        try { await response.body?.cancel() } catch { /* ignore */ }
        return { notModified: true, fetchMs }
      }

      if (response.status === 429) {
        try { await response.body?.cancel() } catch { /* ignore */ }
        return { error: 'Rate limited (HTTP 429). Will retry on next scheduled crawl.' }
      }

      if (response.status >= 500 && attempt < retries) {
        try { await response.body?.cancel() } catch { /* ignore */ }
        lastError = `HTTP ${response.status}`
        continue
      }

      // Content-Type early bail
      const contentType = response.headers.get('content-type')
      if (contentType && !/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
        try { await response.body?.cancel() } catch { /* ignore */ }
        return { skipped: true, reason: `Non-HTML content-type: ${contentType}`, contentType }
      }

      const { text, bytes, truncated } = await readBodyWithCap(response)
      return {
        html: text,
        httpStatus: response.status,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        bytes,
        fetchMs,
        truncated,
        contentType,
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Fetch failed'
      if (attempt < retries) continue
    }
  }

  return { error: lastError || 'Fetch failed after retries' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  let body: { monitored_page_id?: string; crawl_job_id?: string } = {}
  try { body = await req.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }

  const { monitored_page_id, crawl_job_id } = body
  if (!monitored_page_id) return jsonResponse({ error: 'monitored_page_id required' }, 400)

  // All initial DB ops in parallel (now includes markRunning)
  const startedAt = new Date().toISOString()
  const [runningJobRes, pageRes, lastSnapshotRes] = await Promise.all([
    supabaseAdmin.from('crawl_jobs')
      .select('id').eq('monitored_page_id', monitored_page_id).eq('status', 'running').limit(1).maybeSingle(),
    supabaseAdmin.from('monitored_pages')
      .select('*, competitors(user_id)').eq('id', monitored_page_id).maybeSingle(),
    supabaseAdmin.from('page_snapshots')
      .select('id, content_hash, normalized_hash, etag, last_modified')
      .eq('monitored_page_id', monitored_page_id)
      .order('crawled_at', { ascending: false }).limit(1).maybeSingle(),
    crawl_job_id
      ? supabaseAdmin.from('crawl_jobs').update({ status: 'running', started_at: startedAt }).eq('id', crawl_job_id)
      : Promise.resolve(),
  ])

  if (runningJobRes.data) return jsonResponse({ skipped: true, reason: 'already_running' })

  const page = pageRes.data
  if (!page) return jsonResponse({ error: 'Page not found' }, 404)

  const userId = (page.competitors as { user_id: string }).user_id
  const lastSnapshot = lastSnapshotRes.data

  const result = await fetchWithRetry(page.url, MAX_RETRIES, {
    etag: lastSnapshot?.etag ?? null,
    lastModified: lastSnapshot?.last_modified ?? null,
  })

  // Failure
  if ('error' in result) {
    await Promise.all([
      crawl_job_id ? supabaseAdmin.from('crawl_jobs').update({ status: 'failed', error_message: result.error, completed_at: new Date().toISOString() }).eq('id', crawl_job_id) : Promise.resolve(),
      supabaseAdmin.from('monitored_pages').update({ last_crawled_at: new Date().toISOString() }).eq('id', monitored_page_id),
    ])
    return jsonResponse({ error: result.error })
  }

  // 304 short-circuit
  if ('notModified' in result) {
    await Promise.all([
      crawl_job_id ? supabaseAdmin.from('crawl_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', crawl_job_id) : Promise.resolve(),
      supabaseAdmin.from('monitored_pages').update({ last_crawled_at: new Date().toISOString() }).eq('id', monitored_page_id),
    ])
    return jsonResponse({ changed: false, not_modified: true, fetch_ms: result.fetchMs })
  }

  // Non-HTML skip
  if ('skipped' in result) {
    await Promise.all([
      crawl_job_id ? supabaseAdmin.from('crawl_jobs').update({ status: 'completed', error_message: result.reason, completed_at: new Date().toISOString() }).eq('id', crawl_job_id) : Promise.resolve(),
      supabaseAdmin.from('monitored_pages').update({ last_crawled_at: new Date().toISOString() }).eq('id', monitored_page_id),
    ])
    return jsonResponse({ skipped: true, reason: result.reason, content_type: result.contentType })
  }

  const { html, httpStatus, etag, lastModified, bytes, fetchMs, truncated } = result

  const stripped = stripNoise(html)
  const normalizedLines = extractNormalizedLines(stripped)
  const normalizedText = normalizedLines.join('\n')
  const [contentHash, normalizedHash] = await Promise.all([
    computeHash(html),
    computeHash(normalizedText),
  ])

  // No change — backfill ETag + close job
  if (lastSnapshot && lastSnapshot.normalized_hash === normalizedHash) {
    await Promise.all([
      crawl_job_id ? supabaseAdmin.from('crawl_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', crawl_job_id) : Promise.resolve(),
      supabaseAdmin.from('monitored_pages').update({ last_crawled_at: new Date().toISOString() }).eq('id', monitored_page_id),
      (etag || lastModified) ? supabaseAdmin.from('page_snapshots').update({ etag, last_modified: lastModified }).eq('id', lastSnapshot.id) : Promise.resolve(),
    ])
    return jsonResponse({ changed: false, fetch_ms: fetchMs })
  }

  // Content changed — gzip + upload + insert (best-effort upload)
  const prices = extractPrices(extractText(stripped))
  const structuredData = extractByPageType(html, page.page_type ?? 'home')

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const storagePath = `${userId}/${page.competitor_id}/${monitored_page_id}/${ts}.html.gz`
  let resolvedStoragePath: string | null = storagePath

  const gzipped = await gzipString(html)

  const { error: uploadError } = await supabaseAdmin.storage
    .from('snapshots')
    .upload(storagePath, gzipped, {
      contentType: 'text/html',
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) {
    // Best-effort — proceed with null storage_path. detect-changes falls back
    // to normalized_text so change detection still works without HTML in Storage.
    console.error('Storage upload failed (continuing without storage):', uploadError.message)
    resolvedStoragePath = null
  }

  const [{ data: newSnapshot, error: snapError }] = await Promise.all([
    supabaseAdmin.from('page_snapshots').insert({
      monitored_page_id,
      user_id: userId,
      storage_path: resolvedStoragePath,
      normalized_text: normalizedText,
      content_hash: contentHash,
      normalized_hash: normalizedHash,
      prices_json: prices,
      http_status: httpStatus,
      structured_data: structuredData,
      etag,
      last_modified: lastModified,
      content_size: bytes,
      fetch_ms: fetchMs,
    }).select('id').single(),
    supabaseAdmin.from('monitored_pages').update({ last_crawled_at: new Date().toISOString() }).eq('id', monitored_page_id),
    crawl_job_id ? supabaseAdmin.from('crawl_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', crawl_job_id) : Promise.resolve(),
  ])

  if (snapError || !newSnapshot) {
    // Write the *actual* SQL error to crawl_jobs so the next person who
    // queries failed jobs sees the real cause, not the generic message.
    const realMsg = snapError?.message ?? snapError?.code ?? 'unknown DB error'
    const detail  = `Snapshot insert failed: ${realMsg}`
    console.error(detail, snapError)
    if (crawl_job_id) {
      await supabaseAdmin.from('crawl_jobs').update({
        status: 'failed',
        error_message: detail.slice(0, 500),
        completed_at: new Date().toISOString(),
      }).eq('id', crawl_job_id)
    }
    return jsonResponse({ error: detail, code: snapError?.code ?? null }, 500)
  }

  if (lastSnapshot) {
    const detectUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/detect-changes`
    fetch(detectUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitored_page_id, snapshot_before_id: lastSnapshot.id, snapshot_after_id: newSnapshot.id }),
    }).catch((err) => console.error('detect-changes dispatch failed:', err))
  }

  return jsonResponse({
    changed: true,
    snapshot_id: newSnapshot.id,
    fetch_ms: fetchMs,
    bytes,
    gzipped_bytes: gzipped.byteLength,
    truncated,
  })
})
