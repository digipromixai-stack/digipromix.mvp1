import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { extractNormalizedLines, extractPrices, extractByPageType, computeHash } from '../_shared/htmlExtractor.ts'

const CRAWL_TIMEOUT_MS = 20000
const MAX_RETRIES = 2

// Rotate through realistic browser User-Agents to avoid trivial bot detection
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

async function fetchWithRetry(
  url: string,
  retries: number
): Promise<{ html: string; httpStatus: number } | { error: string }> {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
  let lastError = ''

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS)

      const response = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
        },
        signal: controller.signal,
        redirect: 'follow',
      })
      clearTimeout(timeout)

      // 429 = rate limited — don't retry, surface the error immediately
      if (response.status === 429) {
        return { error: 'Rate limited (HTTP 429). Will retry on next scheduled crawl.' }
      }

      // 5xx errors are transient — retry if attempts remain
      if (response.status >= 500 && attempt < retries) {
        lastError = `HTTP ${response.status}`
        continue
      }

      const html = await response.text()
      return { html, httpStatus: response.status }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Fetch failed'
      if (attempt < retries) continue
    }
  }

  return { error: lastError || 'Fetch failed after retries' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  let body: { monitored_page_id?: string; crawl_job_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { monitored_page_id, crawl_job_id } = body
  if (!monitored_page_id) {
    return jsonResponse({ error: 'monitored_page_id required' }, 400)
  }

  // Guard: skip if another crawl is already running for this page
  const { data: runningJob } = await supabaseAdmin
    .from('crawl_jobs')
    .select('id')
    .eq('monitored_page_id', monitored_page_id)
    .eq('status', 'running')
    .limit(1)
    .single()

  if (runningJob) {
    return jsonResponse({ skipped: true, reason: 'already_running' })
  }

  // Fetch page metadata
  const { data: page, error: pageError } = await supabaseAdmin
    .from('monitored_pages')
    .select('*, competitors(user_id)')
    .eq('id', monitored_page_id)
    .single()

  if (pageError || !page) {
    return jsonResponse({ error: 'Page not found' }, 404)
  }

  const userId = (page.competitors as { user_id: string }).user_id

  // Mark job as running
  if (crawl_job_id) {
    await supabaseAdmin
      .from('crawl_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', crawl_job_id)
  }

  // Fetch the page with retry
  const result = await fetchWithRetry(page.url, MAX_RETRIES)

  if ('error' in result) {
    if (crawl_job_id) {
      await supabaseAdmin
        .from('crawl_jobs')
        .update({ status: 'failed', error_message: result.error, completed_at: new Date().toISOString() })
        .eq('id', crawl_job_id)
    }
    await supabaseAdmin
      .from('monitored_pages')
      .update({ last_crawled_at: new Date().toISOString() })
      .eq('id', monitored_page_id)
    return jsonResponse({ error: result.error })
  }

  const { html, httpStatus } = result

  // Compute SHA-256 hashes (async)
  const normalizedLines = extractNormalizedLines(html)
  const normalizedText = normalizedLines.join('\n')
  const [contentHash, normalizedHash] = await Promise.all([
    computeHash(html),
    computeHash(normalizedText),
  ])
  const prices = extractPrices(html)
  const structuredData = extractByPageType(html, page.page_type ?? 'home')

  // Get the most recent snapshot to compare
  const { data: lastSnapshot } = await supabaseAdmin
    .from('page_snapshots')
    .select('id, content_hash, normalized_hash')
    .eq('monitored_page_id', monitored_page_id)
    .order('crawled_at', { ascending: false })
    .limit(1)
    .single()

  // Always update last_crawled_at
  await supabaseAdmin
    .from('monitored_pages')
    .update({ last_crawled_at: new Date().toISOString() })
    .eq('id', monitored_page_id)

  // No meaningful content change
  if (lastSnapshot && lastSnapshot.normalized_hash === normalizedHash) {
    if (crawl_job_id) {
      await supabaseAdmin
        .from('crawl_jobs')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', crawl_job_id)
    }
    return jsonResponse({ changed: false })
  }

  // Store snapshot HTML in Supabase Storage
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const storagePath = `${userId}/${page.competitor_id}/${monitored_page_id}/${ts}.html`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('snapshots')
    .upload(storagePath, html, { contentType: 'text/html', upsert: false })

  if (uploadError) {
    console.error('Storage upload failed:', uploadError.message)
    if (crawl_job_id) {
      await supabaseAdmin
        .from('crawl_jobs')
        .update({ status: 'failed', error_message: `Storage upload failed: ${uploadError.message}`, completed_at: new Date().toISOString() })
        .eq('id', crawl_job_id)
    }
    return jsonResponse({ error: 'Storage upload failed' }, 500)
  }

  // Insert snapshot record
  const { data: newSnapshot, error: snapError } = await supabaseAdmin
    .from('page_snapshots')
    .insert({
      monitored_page_id,
      user_id: userId,
      storage_path: storagePath,
      content_hash: contentHash,
      normalized_hash: normalizedHash,
      prices_json: JSON.stringify(prices),
      http_status: httpStatus,
      structured_data: structuredData,
    })
    .select()
    .single()

  if (snapError || !newSnapshot) {
    console.error('Snapshot insert failed:', snapError?.message)
    if (crawl_job_id) {
      await supabaseAdmin
        .from('crawl_jobs')
        .update({ status: 'failed', error_message: 'Snapshot insert failed', completed_at: new Date().toISOString() })
        .eq('id', crawl_job_id)
    }
    return jsonResponse({ error: 'Snapshot insert failed' }, 500)
  }

  // Complete the job
  if (crawl_job_id) {
    await supabaseAdmin
      .from('crawl_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', crawl_job_id)
  }

  // Trigger change detection asynchronously (fire-and-forget)
  if (lastSnapshot) {
    const detectUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/detect-changes`
    fetch(detectUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        monitored_page_id,
        snapshot_before_id: lastSnapshot.id,
        snapshot_after_id: newSnapshot.id,
      }),
    }).catch((err) => console.error('detect-changes dispatch failed:', err))
  }

  return jsonResponse({ changed: true, snapshot_id: newSnapshot.id })
})
