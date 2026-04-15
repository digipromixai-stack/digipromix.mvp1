import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { MonitoredPageList } from '../components/monitoring/MonitoredPageList'
import { KeywordList } from '../components/monitoring/KeywordList'
import { ChangeCard } from '../components/changes/ChangeCard'
import { Card, CardHeader, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useCrawlNow } from '../hooks/useCrawlNow'
import { Activity, Globe } from 'lucide-react'
import type { Competitor, DetectedChangeWithCompetitor } from '../types/database.types'

export function CompetitorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  const { data: competitor, isLoading: compLoading, isError: compError } = useQuery({
    queryKey: ['competitor', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('competitors')
        .select('*')
        .eq('id', id!)
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data as Competitor | null
    },
    enabled: !!id && !!user,
  })

  const { data: recentChanges = [], isLoading: changesLoading } = useQuery({
    queryKey: ['detected_changes', user?.id, id],
    queryFn: async () => {
      const { data } = await supabase
        .from('detected_changes')
        .select('*, competitors(id, name, website_url, industry), monitored_pages(url, page_type)')
        .eq('competitor_id', id!)
        .order('detected_at', { ascending: false })
        .limit(20)
      return (data ?? []) as DetectedChangeWithCompetitor[]
    },
    enabled: !!id && !!user,
  })

  const { crawlNow, loading: crawling } = useCrawlNow(id ?? '')

  if (compLoading) return <PageSpinner />
  if (compError || !competitor) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-gray-500 font-medium">Competitor not found</p>
      <Link to="/competitors" className="text-sm text-blue-600 hover:underline">← Back to competitors</Link>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/competitors" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
            <Globe size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{competitor.name}</h1>
            <a href={competitor.website_url} target="_blank" rel="noreferrer" className="text-sm text-gray-400 hover:text-blue-500 flex items-center gap-1">
              {competitor.website_url} <ExternalLink size={11} />
            </a>
          </div>
          {competitor.industry && <Badge variant="info">{competitor.industry}</Badge>}
        </div>
        <Button variant="secondary" size="sm" onClick={crawlNow} loading={crawling}>
          <RefreshCw size={14} />
          Crawl Now
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-gray-900">Monitored Pages</h2></CardHeader>
            <CardContent>
              <MonitoredPageList competitorId={competitor.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-gray-900">Keyword Watchlist</h2></CardHeader>
            <CardContent>
              <KeywordList competitorId={competitor.id} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Recent Changes</h2>
                <Link to={`/timeline/${competitor.id}`} className="text-xs text-blue-600 hover:underline">
                  View timeline
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {changesLoading ? (
                <PageSpinner />
              ) : recentChanges.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No changes detected yet"
                  description="Pages will be crawled automatically on schedule."
                />
              ) : (
                <div className="space-y-3">
                  {recentChanges.map((c) => <ChangeCard key={c.id} change={c} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
