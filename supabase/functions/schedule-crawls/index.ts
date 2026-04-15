import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

  // Expire queued jobs older than 10 min (dispatch failed silently) — unblock those pages
  await supabaseAdmin
    .from('crawl_jobs')
    .update({ status: 'failed', error_message: 'Expired: queued but never dispatched', completed_at: now.toISOString() })
    .eq('status', 'queued')
    .lt('created_at', new Date(now.getTime() - 10 * 60 * 1000).toISOString())

  // Expire running jobs older than 5 min (edge function timed out) — unblock those pages
  await supabaseAdmin
    .from('crawl_jobs')
    .update({ status: 'failed', error_message: 'Expired: running job timed out', completed_at: now.toISOString() })
    .eq('status', 'running')
    .lt('started_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString())

  // Fetch all active pages
  const { data: pages, error } = await supabaseAdmin
    .from('monitored_pages')
    .select('id, url, last_crawled_at, competitor_id, competitors(crawl_frequency, is_active)')
    .eq('is_active', true)

  if (error) return jsonResponse({ error: error.message }, 500)

  // Filter pages due for a crawl
  const pagesToCrawl = (pages ?? []).filter((page) => {
    const competitor = page.competitors as { crawl_frequency: string; is_active: boolean } | null
    if (!competitor?.is_active) return false
    const lastCrawled = page.last_crawled_at
    if (!lastCrawled) return true
    const cutoff = competitor.crawl_frequency === 'hourly' ? oneHourAgo : oneDayAgo
    return lastCrawled < cutoff
  })

  if (pagesToCrawl.length === 0) return jsonResponse({ scheduled: 0 })

  // Skip pages with a job queued in last 5 min or currently running
  const pageIds = pagesToCrawl.map((p) => p.id)
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
  const { data: activeJobs } = await supabaseAdmin
    .from('crawl_jobs')
    .select('monitored_page_id')
    .in('monitored_page_id', pageIds)
    .or(`status.eq.running,and(status.eq.queued,created_at.gte.${fiveMinAgo})`)

  const activePageIds = new Set((activeJobs ?? []).map((j) => j.monitored_page_id))
  const filteredPages = pagesToCrawl.filter((p) => !activePageIds.has(p.id))

  if (filteredPages.length === 0) return jsonResponse({ scheduled: 0, skipped_active: activePageIds.size })

  const { data: jobs } = await supabaseAdmin
    .from('crawl_jobs')
    .insert(filteredPages.map((page) => ({
      competitor_id: page.competitor_id,
      monitored_page_id: page.id,
      status: 'queued',
    })))
    .select('id, monitored_page_id')

  if (!jobs) return jsonResponse({ error: 'Failed to create jobs' }, 500)

  // Fire-and-forget — do not await crawl results
  const crawlUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/crawl-page`
  const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`

  jobs.forEach((job) =>
    fetch(crawlUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitored_page_id: job.monitored_page_id, crawl_job_id: job.id }),
      signal: AbortSignal.timeout(3000),
    }).catch((err) => console.error(`Dispatch failed for job ${job.id}:`, err))
  )

  return jsonResponse({ total: jobs.length, dispatched: jobs.length, skipped_active: activePageIds.size })
})
