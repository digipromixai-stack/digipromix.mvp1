import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ChangeTypeBadge, SeverityBadge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { timeAgo, formatUrl } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import {
  Activity, Building2, Bell, TrendingUp,
  ExternalLink, Sparkles, Megaphone, DollarSign,
  FileText, Layout, RefreshCw, ArrowRight,
} from 'lucide-react'
import type { DetectedChangeWithCompetitor, Competitor } from '../types/database.types'

// ── helpers ──────────────────────────────────────────────────────────────────

function faviconUrl(websiteUrl: string) {
  try {
    const { hostname } = new URL(websiteUrl)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
  } catch {
    return null
  }
}

const CHANGE_META: Record<string, { icon: typeof Activity; color: string; bg: string; border: string }> = {
  promotion:      { icon: Megaphone,   color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-400' },
  price_change:   { icon: DollarSign,  color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-400' },
  new_landing_page:{ icon: Layout,     color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-400' },
  new_blog_post:  { icon: FileText,    color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-400' },
  banner_change:  { icon: Sparkles,    color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-400' },
  content_change: { icon: RefreshCw,   color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-300' },
}

function groupByDay(changes: DetectedChangeWithCompetitor[]) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000)
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000)

  const groups: { label: string; items: DetectedChangeWithCompetitor[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Earlier this week', items: [] },
    { label: 'Older', items: [] },
  ]

  for (const c of changes) {
    const d = new Date(c.detected_at)
    if (d >= startOfToday) groups[0].items.push(c)
    else if (d >= startOfYesterday) groups[1].items.push(c)
    else if (d >= startOfWeek) groups[2].items.push(c)
    else groups[3].items.push(c)
  }

  return groups.filter((g) => g.items.length > 0)
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, sub,
}: {
  label: string; value: number; icon: typeof Activity; color: string; sub?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
      <div className={`flex items-center justify-center w-11 h-11 rounded-xl ${color} shrink-0`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function FeedItem({ change }: { change: DetectedChangeWithCompetitor }) {
  const meta = CHANGE_META[change.change_type] ?? CHANGE_META.content_change
  const Icon = meta.icon
  const favicon = faviconUrl(change.competitors?.website_url ?? '')

  return (
    <div className={`flex gap-3 pl-4 border-l-4 ${meta.border} py-0.5`}>
      {/* icon */}
      <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${meta.bg} shrink-0 mt-0.5`}>
        <Icon size={16} className={meta.color} />
      </div>

      {/* content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <ChangeTypeBadge type={change.change_type} />
            <SeverityBadge severity={change.severity} />
          </div>
          <span className="text-xs text-gray-400 shrink-0 mt-0.5">{timeAgo(change.detected_at)}</span>
        </div>

        <p className="text-sm font-semibold text-gray-900 mt-1">{change.title}</p>

        {change.description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{change.description}</p>
        )}

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {favicon && (
            <img src={favicon} alt="" className="w-4 h-4 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
          <Link
            to={`/timeline/${change.competitor_id}`}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            {change.competitors?.name}
          </Link>
          <span className="text-gray-300">·</span>
          <a
            href={change.monitored_pages?.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
          >
            {formatUrl(change.monitored_pages?.url ?? '')}
            <ExternalLink size={10} className="shrink-0 ml-0.5" />
          </a>
          <span className="text-gray-300">·</span>
          <Link
            to={`/timeline/${change.competitor_id}`}
            className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-0.5"
          >
            View diff <ArrowRight size={10} />
          </Link>
        </div>
      </div>
    </div>
  )
}

function CompetitorCard({ competitor, changeCount, lastChange }: {
  competitor: Pick<Competitor, 'id' | 'name' | 'website_url'>
  changeCount: number
  lastChange: DetectedChangeWithCompetitor | undefined
}) {
  const favicon = faviconUrl(competitor.website_url)
  const meta = lastChange ? (CHANGE_META[lastChange.change_type] ?? CHANGE_META.content_change) : null

  return (
    <Link
      to={`/timeline/${competitor.id}`}
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors bg-white"
    >
      {favicon ? (
        <img src={favicon} alt="" className="w-7 h-7 rounded-md" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      ) : (
        <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center">
          <Building2 size={14} className="text-gray-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{competitor.name}</p>
        {lastChange && meta ? (
          <p className={`text-xs ${meta.color} truncate`}>{lastChange.title}</p>
        ) : (
          <p className="text-xs text-gray-400">No changes yet</p>
        )}
      </div>
      <span className="text-xs font-bold text-gray-500 shrink-0">{changeCount}</span>
    </Link>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()

  // Stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard_stats', user?.id],
    queryFn: async () => {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const [competitors, changesToday, changes7d, unreadAlerts, highSeverity] = await Promise.all([
        supabase.from('competitors').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('is_active', true),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('detected_at', todayStart.toISOString()),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('detected_at', new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('channel', 'dashboard').eq('status', 'pending'),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('severity', 'high').gte('detected_at', new Date(Date.now() - 7 * 86400000).toISOString()),
      ])
      return {
        competitors: competitors.count ?? 0,
        changesToday: changesToday.count ?? 0,
        changes7d: changes7d.count ?? 0,
        unreadAlerts: unreadAlerts.count ?? 0,
        highSeverity: highSeverity.count ?? 0,
      }
    },
    enabled: !!user,
  })

  // Full activity feed
  const { data: recentChanges = [], isLoading: changesLoading } = useQuery({
    queryKey: ['detected_changes', 'dashboard_feed', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('detected_changes')
        .select('*, competitors(id, name, website_url, industry), monitored_pages(url, page_type)')
        .eq('user_id', user!.id)
        .order('detected_at', { ascending: false })
        .limit(30)
      return (data ?? []) as DetectedChangeWithCompetitor[]
    },
    enabled: !!user,
    refetchInterval: 30000, // auto-refresh every 30s
  })

  // Competitor list for the sidebar
  const { data: competitors = [] } = useQuery({
    queryKey: ['competitors', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('competitors')
        .select('id, name, website_url')
        .eq('user_id', user!.id)
        .eq('is_active', true)
        .order('name')
      return (data ?? []) as Pick<Competitor, 'id' | 'name' | 'website_url'>[]
    },
    enabled: !!user,
  })

  // Load demo data mutation (for existing users with no data)
  const seedDemo = useMutation({
    mutationFn: () => supabase.rpc('seed_demo_data', { p_user_id: user!.id }) as unknown as Promise<unknown>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
      qc.invalidateQueries({ queryKey: ['detected_changes'] })
      qc.invalidateQueries({ queryKey: ['competitors'] })
      toast('Demo data loaded — explore your intelligence feed!', 'success', 'Demo Ready')
    },
    onError: () => toast('Failed to load demo data', 'error'),
  })

  const grouped = useMemo(() => groupByDay(recentChanges), [recentChanges])

  // Per-competitor change counts and last change
  const competitorStats = useMemo(() => {
    const map: Record<string, { count: number; last: DetectedChangeWithCompetitor | undefined }> = {}
    for (const c of recentChanges) {
      if (!map[c.competitor_id]) map[c.competitor_id] = { count: 0, last: undefined }
      map[c.competitor_id].count++
      if (!map[c.competitor_id].last) map[c.competitor_id].last = c
    }
    return map
  }, [recentChanges])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'there'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  if (statsLoading) return <PageSpinner />

  const hasData = (stats?.competitors ?? 0) > 0

  return (
    <div className="space-y-6 max-w-7xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}, {firstName} 👋</h1>
          <p className="text-gray-500 text-sm mt-1">
            {hasData
              ? `${stats!.competitors} competitors monitored · ${stats!.changes7d} changes in the last 7 days`
              : 'Load demo data to see what your competitors are launching'}
          </p>
        </div>
        {!hasData && (
          <button
            onClick={() => seedDemo.mutate()}
            disabled={seedDemo.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            <Sparkles size={15} />
            {seedDemo.isPending ? 'Loading…' : 'Load demo data'}
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Competitors" value={stats?.competitors ?? 0} icon={Building2} color="bg-blue-500" />
        <StatCard label="Today's changes" value={stats?.changesToday ?? 0} icon={Activity} color="bg-green-500" sub={`${stats?.changes7d ?? 0} this week`} />
        <StatCard label="High severity" value={stats?.highSeverity ?? 0} icon={TrendingUp} color="bg-red-500" sub="last 7 days" />
        <StatCard label="Unread alerts" value={stats?.unreadAlerts ?? 0} icon={Bell} color="bg-orange-500" />
      </div>

      {/* ── Main content ── */}
      <div className="flex gap-6 items-start">

        {/* ── Intelligence Feed ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
              Live Intelligence Feed
            </h2>
            <Link to="/timeline" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>

          {changesLoading ? (
            <PageSpinner />
          ) : grouped.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center bg-white">
              <Activity size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">No competitor moves detected yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Crawls run hourly. Use the{' '}
                <Link to="/competitors" className="text-blue-500 hover:underline">Competitors page</Link>{' '}
                to trigger a manual crawl.
              </p>
              {!hasData && (
                <button
                  onClick={() => seedDemo.mutate()}
                  disabled={seedDemo.isPending}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  <Sparkles size={14} />
                  {seedDemo.isPending ? 'Loading…' : 'Load demo data to preview'}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{group.label}</p>
                  <div className="space-y-4">
                    {group.items.map((change) => (
                      <FeedItem key={change.id} change={change} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Competitor Breakdown ── */}
        {competitors.length > 0 && (
          <div className="w-64 shrink-0">
            <h2 className="text-base font-bold text-gray-900 mb-3">Competitors</h2>
            <div className="space-y-2">
              {competitors.map((c) => (
                <CompetitorCard
                  key={c.id}
                  competitor={c}
                  changeCount={competitorStats[c.id]?.count ?? 0}
                  lastChange={competitorStats[c.id]?.last}
                />
              ))}
            </div>
            <Link
              to="/competitors"
              className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-blue-600 py-2"
            >
              Manage competitors <ArrowRight size={11} />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
