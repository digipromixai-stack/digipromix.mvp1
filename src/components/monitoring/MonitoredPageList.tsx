import { useState } from 'react'
import { ExternalLink, Trash2, Plus, Clock, RefreshCw } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { useMonitoredPages, useDeleteMonitoredPage } from '../../hooks/useMonitoredPages'
import { AddPageForm } from './AddPageForm'
import { useToast } from '../ui/Toast'
import { timeAgo } from '../../lib/utils'
import { PageSpinner } from '../ui/Spinner'
import { supabase, invokeFunction } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

const PAGE_TYPE_LABELS: Record<string, string> = {
  home: 'Home',
  pricing: 'Pricing',
  promotions: 'Promotions',
  blog: 'Blog',
  landing_page: 'Landing Page',
  custom: 'Custom',
}

export function MonitoredPageList({ competitorId }: { competitorId: string }) {
  const [addOpen, setAddOpen] = useState(false)
  const [crawlingPageId, setCrawlingPageId] = useState<string | null>(null)
  const { data: pages = [], isLoading } = useMonitoredPages(competitorId)
  const deletePage = useDeleteMonitoredPage()
  const { toast } = useToast()
  const qc = useQueryClient()

  async function crawlPage(pageId: string) {
    setCrawlingPageId(pageId)
    try {
      const { data: job } = await supabase
        .from('crawl_jobs')
        .insert({ competitor_id: competitorId, monitored_page_id: pageId, status: 'queued' })
        .select('id')
        .single()

      const { error } = await invokeFunction('crawl-page', {
        monitored_page_id: pageId,
        crawl_job_id: job?.id,
      })

      if (error) throw error
      toast('Page crawled successfully', 'success', 'Crawl Complete')
      qc.invalidateQueries({ queryKey: ['monitored_pages', competitorId] })
      qc.invalidateQueries({ queryKey: ['detected_changes'] })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Crawl failed', 'error', 'Crawl Error')
    } finally {
      setCrawlingPageId(null)
    }
  }

  if (isLoading) return <PageSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Monitored Pages ({pages.length})</h3>
        <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Add page
        </Button>
      </div>

      <div className="space-y-2">
        {pages.map((page) => (
          <div key={page.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300">
            <Badge variant="info">{PAGE_TYPE_LABELS[page.page_type] ?? page.page_type}</Badge>
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 text-sm text-gray-700 hover:text-blue-600 truncate flex items-center gap-1 min-w-0"
            >
              <span className="truncate">{page.url}</span>
              <ExternalLink size={11} className="shrink-0" />
            </a>
            {page.last_crawled_at ? (
              <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
                <Clock size={11} /> {timeAgo(page.last_crawled_at)}
              </span>
            ) : (
              <span className="text-xs text-gray-400 shrink-0">Not crawled</span>
            )}
            <button
              onClick={() => crawlPage(page.id)}
              disabled={crawlingPageId === page.id}
              title="Crawl this page now"
              className="p-1 text-gray-400 hover:text-blue-500 disabled:opacity-40"
            >
              <RefreshCw size={14} className={crawlingPageId === page.id ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => deletePage.mutate({ id: page.id, competitor_id: competitorId })}
              className="p-1 text-gray-400 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <AddPageForm open={addOpen} onClose={() => setAddOpen(false)} competitorId={competitorId} />
    </div>
  )
}
