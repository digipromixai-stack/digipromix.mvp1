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
  const oneDayAgo  = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

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

  // ── Expire stale running jobs (>5 min) — edge function timed out ──────────
  await supabaseAdmin
    .from('crawl_jobs')
    .update({
      status: 'failed',
      error_message: 'Expired: running job timed out',
      completed_at: now.toISOString(),
    })
    .eq('status', 'running')
    .lt('started_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString())

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
    const cutoff = competitor.crawl_frequency === 'hourly' ? oneHourAgo : oneDayAgo
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

  // ── Dispatch crawl-page for each job (fire-and-forget) ────────────────────
  const crawlUrl  = `${Deno.env.get('SUPABASE_URL')}/functions/v1/crawl-page`
  const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`

  const dispatched: string[] = []
  const failed:     string[] = []

  await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        const res = await fetch(crawlUrl, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            monitored_page_id: job.monitored_page_id,
            crawl_job_id:      job.id,
          }),
          signal: AbortSignal.timeout(10_000), // 10 s — enough to confirm receipt
        })
        if (res.ok) {
          dispatched.push(job.id)
        } else {
          const text = await res.text().catch(() => res.status.toString())
          console.error(`Dispatch HTTP error for job ${job.id}: ${res.status} ${text}`)
          failed.push(job.id)
        }
      } catch (err) {
        console.error(`Dispatch fetch failed for job ${job.id}:`, err)
        failed.push(job.id)
      }
    })
  )

  console.log(`schedule-crawls: dispatched=${dispatched.length} failed=${failed.length} skipped_active=${activePageIds.size}`)

  return jsonResponse({
    total:          jobs.length,
    dispatched:     dispatched.length,
    failed:         failed.length,
    skipped_active: activePageIds.size,
  })
})
