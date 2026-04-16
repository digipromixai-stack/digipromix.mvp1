import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'

const CRAWLER_URL = import.meta.env.VITE_CRAWLER_URL || 'https://backend-vatt.onrender.com/api/trigger'

export function useCrawlNow(competitorId: string) {
  const [loading, setLoading] = useState(false)
  const qc = useQueryClient()
  const { toast } = useToast()

  async function crawlNow() {
    setLoading(true)
    try {
      // Check there are active pages for this competitor
      const { data: pages, error } = await supabase
        .from('monitored_pages')
        .select('id')
        .eq('competitor_id', competitorId)
        .eq('is_active', true)

      if (error) throw error

      if (!pages || pages.length === 0) {
        toast('No active pages to crawl for this competitor', 'info', 'Nothing to crawl')
        return
      }

      // Trigger Python crawler for this specific competitor
      const res = await fetch(CRAWLER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitor_id: competitorId }),
      })

      if (!res.ok) throw new Error(`Crawler returned HTTP ${res.status}`)

      toast(
        `Crawling ${pages.length} page(s) — results appear in ~30s`,
        'success',
        'Crawl Started'
      )

      // Refresh UI after crawl has had time to complete
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['detected_changes'] })
        qc.invalidateQueries({ queryKey: ['monitored_pages', competitorId] })
        qc.invalidateQueries({ queryKey: ['crawl_jobs', competitorId] })
        qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
      }, 5_000)

      // Second refresh at 30s to catch slower pages
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['detected_changes'] })
        qc.invalidateQueries({ queryKey: ['crawl_jobs', competitorId] })
      }, 30_000)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Crawl failed'
      toast(msg, 'error', 'Crawl Error')
    } finally {
      setLoading(false)
    }
  }

  return { crawlNow, loading }
}
