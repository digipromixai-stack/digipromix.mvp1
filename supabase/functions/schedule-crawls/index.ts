import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const now = new Date()
  // "daily" competitors used to wait 24h. We dropped to 6h because Render's
  // Python crawler is unreliable — this Edge-fn path becomes the primary
  // freshness guarantee (every 6h via the hourly cron). hourly stays at 1h.
  const sixHoursAgo = new Date(now.getTime() - 6  * 60 * 60 * 1000).toISOString()
  const oneHourAgo  = new Date(now.getTime() - 1  * 60 * 60 * 1000).toISOString()

  // ── Expire stale queued jobs (>10 min) — unblock those pages ──────────────
  await supabaseAdmin
    .from('crawl_jobs')
    .update({
      status: 'failed',
      error_message: 'Expired: queued but never dispatched',
      completed_at: now.toISOString(),
    })
    .eq('status', 'queued')
    .lt('created_at', new Date(now.getTime() - 10 * 60 * 1000).toISOString())

  // ── Expire stale running jobs (>90s) — edge function timed out ──────────
  // crawl-page has a tight ~25s budget; anything older than 90s is definitely
  // stuck and should be cleared so its monitored_page can re-enter the queue
  // on the next tick.
  await supabaseAdmin
    .from('crawl_jobs')
    .update({
      status: 'failed',
      error_message: 'Expired: running job timed out',
      completed_at: now.toISOString(),
    })
    .eq('status', 'running')
    .lt('started_at', new Date(now.getTime() - 90 * 1000).toISOString())

  // ── Fetch all active monitored pages ──────────────────────────────────────
  const { data: pages, error } = await supabaseAdmin
    .from('monitored_pages')
    .select('id, url, last_crawled_at, competitor_id, competitors(crawl_frequency, is_active)')
    .eq('is_active', true)

  if (error) {
    console.error('Failed to fetch monitored pages:', error.message)
    return jsonResponse({ error: error.message }, 500)
  }

  if (!pages || pages.length === 0) {
    return jsonResponse({ scheduled: 0, reason: 'no_active_pages' })
  }

  // ── Filter pages that are due for a crawl ─────────────────────────────────
  const pagesToCrawl = pages.filter((page) => {
    const competitor = page.competitors as { crawl_frequency: string; is_active: boolean } | null
    if (!competitor?.is_active) return false
    const lastCrawled = page.last_crawled_at
    if (!lastCrawled) return true  // never crawled — always due
    const cutoff = competitor.crawl_frequency === 'hourly' ? oneHourAgo : sixHoursAgo
    return lastCrawled < cutoff
  })

  if (pagesToCrawl.length === 0) {
    return jsonResponse({ scheduled: 0, reason: 'all_pages_up_to_date' })
  }

  // ── Skip pages already queued / running ───────────────────────────────────
  const pageIds = pagesToCrawl.map((p) => p.id)
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()

  const { data: activeJobs } = await supabaseAdmin
    .from('crawl_jobs')
    .select('monitored_page_id')
    .in('monitored_page_id', pageIds)
    .or(`status.eq.running,and(status.eq.queued,created_at.gte.${fiveMinAgo})`)

  const activePageIds = new Set((activeJobs ?? []).map((j) => j.monitored_page_id))
  const filteredPages = pagesToCrawl.filter((p) => !activePageIds.has(p.id))

  if (filteredPages.length === 0) {
    return jsonResponse({ scheduled: 0, skipped_active: activePageIds.size })
  }

  // ── Insert crawl_jobs ─────────────────────────────────────────────────────
  const { data: jobs, error: insertError } = await supabaseAdmin
    .from('crawl_jobs')
    .insert(
      filteredPages.map((page) => ({
        competitor_id: page.competitor_id,
        monitored_page_id: page.id,
        status: 'queued',
      }))
    )
    .select('id, monitored_page_id')

  if (insertError || !jobs) {
    console.error('Failed to create crawl jobs:', insertError?.message)
    return jsonResponse({ error: 'Failed to create jobs' }, 500)
  }

  // ── Dispatch crawl-page with bounded concurrency ──────────────────────────
  // Firing every job at once (~50/tick) overran the platform's concurrent
  // invocation limit: many requests never reached crawl-page and the jobs
  // expired as "queued but never dispatched". A small worker pool keeps the
  // load steady, and a rejected dispatch is recorded on the job instead of
  // being silently lost. The whole pool runs after we return, via waitUntil.
  const crawlUrl   = `${Deno.env.get('SUPABASE_URL')}/functions/v1/crawl-page`
  const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
  const DISPATCH_CONCURRENCY = 8

  const markDispatchFailed = (jobId: string, reason: string) =>
    supabaseAdmin.from('crawl_jobs').update({
      status: 'failed',
      error_message: `Dispatch failed: ${reason}`.slice(0, 300),
      completed_at: new Date().toISOString(),
    }).eq('id', jobId).eq('status', 'queued')

  // The Edge Runtime caps function-to-function calls per trace (~30/min) and
  // throws "Rate limit exceeded for trace … Retry after Nms." — wait it out.
  const MAX_DISPATCH_ATTEMPTS = 3

  const dispatchOne = async (job: { id: string; monitored_page_id: string }) => {
    for (let attempt = 1; attempt <= MAX_DISPATCH_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(crawlUrl, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            monitored_page_id: job.monitored_page_id,
            crawl_job_id:      job.id,
          }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          console.error(`Dispatch rejected for job ${job.id}: HTTP ${res.status} ${text.slice(0, 120)}`)
          await markDispatchFailed(job.id, `HTTP ${res.status} ${text.slice(0, 120)}`)
        } else {
          await res.body?.cancel()
        }
        return
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const retryAfter = message.match(/Retry after (\d+)\s*ms/i)
        if (retryAfter && attempt < MAX_DISPATCH_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, Number(retryAfter[1]) + 1000))
          continue
        }
        console.error(`Dispatch failed for job ${job.id}:`, err)
        await markDispatchFailed(job.id, message)
        return
      }
    }
  }

  const queue = [...jobs]
  const pool = Promise.all(
    Array.from({ length: Math.min(DISPATCH_CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) await dispatchOne(queue.shift()!)
    }),
  )

  // @ts-expect-error EdgeRuntime is Supabase-specific, not typed in deno-edge
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(pool)
  else await pool

  console.log(`schedule-crawls: queued=${jobs.length} skipped_active=${activePageIds.size}`)

  return jsonResponse({
    total:          jobs.length,
    queued:         jobs.length,
    skipped_active: activePageIds.size,
  })
})
