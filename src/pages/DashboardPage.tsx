import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ChangeTypeBadge, SeverityBadge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { timeAgo, formatUrl } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import { useAiRecommendations, useApplyRecommendation, useDismissRecommendation } from '../hooks/useAiRecommendations'
import { CampaignModal } from '../components/campaigns/CampaignModal'
import {
  Activity, Building2,
  ExternalLink, Sparkles, Megaphone, DollarSign,
  FileText, Layout, RefreshCw, ArrowRight, Target,
  AlertTriangle, CheckCircle2, Zap, Rocket, TrendingUp,
  ChevronRight, X, Users,
} from 'lucide-react'
import type { DetectedChangeWithCompetitor, Competitor, Opportunity, RecommendationAction } from '../types/database.types'

// ── helpers ───────────────────────────────────────────────────────────────────

function faviconUrl(websiteUrl: string) {
  try {
    const { hostname } = new URL(websiteUrl)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
  } catch {
    return null
  }
}

const CHANGE_META: Record<string, { icon: typeof Activity; color: string; bg: string; border: string }> = {
  promotion:       { icon: Megaphone,  color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-400' },
  price_change:    { icon: DollarSign, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-400' },
  new_landing_page:{ icon: Layout,     color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-400' },
  new_blog_post:   { icon: FileText,   color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-400' },
  banner_change:   { icon: Sparkles,   color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-400' },
  content_change:  { icon: RefreshCw,  color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-300' },
}

const ACTION_META: Record<RecommendationAction, { label: string; color: string; bg: string; icon: typeof Zap }> = {
  launch_campaign:   { label: 'Launch Campaign',   color: 'text-green-700',  bg: 'bg-green-50',  icon: Rocket  },
  adjust_budget:     { label: 'Adjust Budget',     color: 'text-blue-700',   bg: 'bg-blue-50',   icon: DollarSign },
  pause_campaign:    { label: 'Pause Campaign',    color: 'text-red-700',    bg: 'bg-red-50',    icon: AlertTriangle },
  change_creative:   { label: 'New Creative',      color: 'text-purple-700', bg: 'bg-purple-50', icon: Sparkles },
  change_audience:   { label: 'Update Audience',   color: 'text-indigo-700', bg: 'bg-indigo-50', icon: Target },
  scale_campaign:    { label: 'Scale Up',          color: 'text-emerald-700',bg: 'bg-emerald-50',icon: TrendingUp },
  reactivate:        { label: 'Reactivate',        color: 'text-amber-700',  bg: 'bg-amber-50',  icon: Zap },
  setup_tracking:    { label: 'Setup Tracking',    color: 'text-gray-700',   bg: 'bg-gray-50',   icon: Activity },
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
  label, value, icon: Icon, color, sub, to,
}: {
  label: string; value: number | string; icon: typeof Activity; color: string; sub?: string; to?: string
}) {
  const content = (
    <div className={`bg-white rounded-xl border border-gray-200 px-3 sm:px-5 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 ${to ? 'hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer' : ''}`}>
      <div className={`flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-xl ${color} shrink-0`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{content}</Link> : content
}

function FeedItem({ change }: { change: DetectedChangeWithCompetitor }) {
  const meta = CHANGE_META[change.change_type] ?? CHANGE_META.content_change
  const Icon = meta.icon
  const favicon = faviconUrl(change.competitors?.website_url ?? '')

  return (
    <div className={`flex gap-2 sm:gap-3 pl-3 sm:pl-4 border-l-4 ${meta.border} py-0.5`}>
      <div className={`hidden sm:flex items-center justify-center w-9 h-9 rounded-lg ${meta.bg} shrink-0 mt-0.5`}>
        <Icon size={16} className={meta.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <ChangeTypeBadge type={change.change_type} />
            <SeverityBadge severity={change.severity} />
          </div>
          <span className="text-xs text-gray-400 shrink-0 mt-0.5">{timeAgo(change.detected_at)}</span>
        </div>
        <p className="text-sm font-semibold text-gray-900 mt-1 line-clamp-2">{change.title}</p>
        {change.description && (
          <p className="hidden sm:block text-xs text-gray-500 mt-0.5 line-clamp-1">{change.description}</p>
        )}
        <div className="flex items-center gap-1.5 sm:gap-2 mt-2 flex-wrap">
          {favicon && (
            <img src={favicon} alt="" className="w-4 h-4 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
          <Link to={`/timeline/${change.competitor_id}`} className="text-xs font-medium text-blue-600 hover:underline truncate max-w-[120px] sm:max-w-none">
            {change.competitors?.name}
          </Link>
          <span className="text-gray-300 hidden sm:inline">·</span>
          <a href={change.monitored_pages?.url} target="_blank" rel="noreferrer" className="text-xs text-gray-400 hover:text-gray-600 items-center gap-0.5 hidden sm:flex">
            {formatUrl(change.monitored_pages?.url ?? '')}
            <ExternalLink size={10} className="shrink-0 ml-0.5" />
          </a>
          <span className="text-gray-300">·</span>
          <Link to={`/timeline/${change.competitor_id}`} className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-0.5">
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

// ── AI Suggested Actions panel ────────────────────────────────────────────────

function AiActionsPanel() {
  const { data: recs = [], isLoading } = useAiRecommendations()
  const apply = useApplyRecommendation()
  const dismiss = useDismissRecommendation()

  if (isLoading || recs.length === 0) return null

  const top3 = recs.slice(0, 3)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-indigo-50">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-500" />
          <span className="text-sm font-bold text-violet-900">AI Suggested Actions</span>
        </div>
        <Link to="/opportunities" className="text-xs text-violet-600 hover:underline flex items-center gap-0.5">
          All <ChevronRight size={11} />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {top3.map((rec) => {
          const am = ACTION_META[rec.action_type] ?? ACTION_META.launch_campaign
          const Icon = am.icon
          return (
            <div key={rec.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${am.bg} shrink-0 mt-0.5`}>
                <Icon size={14} className={am.color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-0.5">{am.label}</p>
                <p className="text-sm font-medium text-gray-900 line-clamp-2">{rec.recommendation}</p>
                {rec.campaigns && (
                  <p className="text-xs text-gray-400 mt-0.5">Campaign: {rec.campaigns.campaign_name}</p>
                )}
                {rec.confidence != null && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.round(rec.confidence * 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400">{Math.round(rec.confidence * 100)}% confidence</span>
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => apply.mutate(rec.id)}
                  disabled={apply.isPending}
                  className="text-[11px] px-2 py-1 rounded-md bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={() => dismiss.mutate(rec.id)}
                  disabled={dismiss.isPending}
                  className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Hot Opportunities quick-launch ────────────────────────────────────────────

function HotOpportunitiesPanel({
  opportunities,
  onLaunch,
}: {
  opportunities: Opportunity[]
  onLaunch: (opp: Opportunity) => void
}) {
  if (opportunities.length === 0) return null
  const top3 = opportunities.slice(0, 3)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-green-500" />
          <span className="text-sm font-bold text-gray-900">One-Click Launch</span>
        </div>
        <Link to="/opportunities" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
          All <ChevronRight size={11} />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {top3.map((opp) => (
          <div key={opp.id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {opp.opportunity_score >= 75 && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">🔥 HOT</span>
                )}
                {opp.confidence != null && (
                  <span className="text-[10px] text-gray-400">{Math.round(opp.confidence * 100)}% confidence</span>
                )}
              </div>
              <p className="text-sm font-semibold text-gray-900 line-clamp-1">{opp.title}</p>
              {opp.expected_leads != null && (
                <p className="text-xs text-gray-400 mt-0.5">~{opp.expected_leads} est. leads</p>
              )}
            </div>
            <button
              onClick={() => onLaunch(opp)}
              className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg text-white transition-colors ${
                opp.opportunity_score >= 75 ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              Launch
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Campaign Performance Snapshot ─────────────────────────────────────────────

function CampaignSnapshot({ userId }: { userId: string }) {
  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns_snapshot', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('id, campaign_name, status, leads_count, views_count, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(4)
      return data ?? []
    },
  })

  if (campaigns.length === 0) return null

  const STATUS_COLOR: Record<string, string> = {
    active:    'text-green-600 bg-green-50',
    draft:     'text-gray-500 bg-gray-100',
    paused:    'text-amber-600 bg-amber-50',
    completed: 'text-blue-600 bg-blue-50',
    failed:    'text-red-600 bg-red-50',
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Rocket size={14} className="text-blue-500" />
          <span className="text-sm font-bold text-gray-900">Campaign Performance</span>
        </div>
        <Link to="/campaigns" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
          All <ChevronRight size={11} />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {campaigns.map((c) => (
          <div key={c.id} className="px-4 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{c.campaign_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${STATUS_COLOR[c.status] ?? STATUS_COLOR.draft}`}>
                  {c.status}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-gray-900">{c.leads_count}</p>
              <p className="text-[10px] text-gray-400">leads</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [launchChange, setLaunchChange] = useState<DetectedChangeWithCompetitor | null>(null)
  const [launchHint, setLaunchHint] = useState<{
    title?: string; recommended_budget?: number | null; expected_leads?: number | null
    estimated_cpc?: number | null; confidence?: number | null; industry?: string | null
  } | undefined>(undefined)

  // Stats
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['dashboard_stats', user?.id],
    queryFn: async () => {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const [competitors, changesToday, changes7d, unreadAlerts, highSeverity, openOpps, totalLeads] = await Promise.all([
        supabase.from('competitors').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('is_active', true),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('detected_at', todayStart.toISOString()),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('detected_at', new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('channel', 'dashboard').eq('status', 'pending'),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('severity', 'high').gte('detected_at', new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'open'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
      ])
      return {
        competitors: competitors.count ?? 0,
        changesToday: changesToday.count ?? 0,
        changes7d: changes7d.count ?? 0,
        unreadAlerts: unreadAlerts.count ?? 0,
        highSeverity: highSeverity.count ?? 0,
        openOpps: openOpps.count ?? 0,
        totalLeads: totalLeads.count ?? 0,
      }
    },
    enabled: !!user,
    refetchInterval: 30000,
  })

  // Top open opportunity hero
  const { data: topOpp } = useQuery<Opportunity | null>({
    queryKey: ['top_opportunity', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('opportunities')
        .select('*')
        .eq('user_id', user!.id)
        .eq('status', 'open')
        .order('opportunity_score', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as Opportunity | null
    },
    enabled: !!user,
  })

  // Top 3 open opportunities for quick-launch panel
  const { data: topOpps = [] } = useQuery<Opportunity[]>({
    queryKey: ['top_opportunities_panel', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('opportunities')
        .select('*')
        .eq('user_id', user!.id)
        .eq('status', 'open')
        .order('opportunity_score', { ascending: false })
        .limit(3)
      return (data ?? []) as Opportunity[]
    },
    enabled: !!user,
  })

  // Competitor activity feed (threat radar)
  const { data: recentChanges = [], isLoading: changesLoading } = useQuery({
    queryKey: ['detected_changes', 'dashboard_feed', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('detected_changes')
        .select('*, competitors(id, name, website_url, industry), monitored_pages(url, page_type)')
        .eq('user_id', user!.id)
        .order('detected_at', { ascending: false })
        .limit(20)
      return (data ?? []) as DetectedChangeWithCompetitor[]
    },
    enabled: !!user,
    refetchInterval: 30000,
  })

  // Competitors sidebar
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

  const seedDemo = useMutation({
    mutationFn: () => supabase.rpc('seed_demo_data', { p_user_id: user!.id }) as unknown as Promise<unknown>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard_stats'] })
      qc.invalidateQueries({ queryKey: ['detected_changes'] })
      qc.invalidateQueries({ queryKey: ['competitors'] })
      toast('Demo data loaded!', 'success', 'Demo Ready')
    },
    onError: () => toast('Failed to load demo data', 'error'),
  })

  // Quick-launch an opportunity: resolve its source change and open modal
  async function handleOppLaunch(opp: Opportunity) {
    const meta = (opp.metadata as Record<string, unknown> | null) ?? {}
    const sourceId = meta.source_change_id as string | undefined
    if (!sourceId) {
      toast('No source signal found. Visit Opportunity Radar for details.', 'info')
      return
    }
    const { data, error } = await supabase
      .from('detected_changes')
      .select('*, competitors(id, name, website_url, industry), monitored_pages(url, page_type)')
      .eq('id', sourceId)
      .single()
    if (error || !data) {
      toast('Could not load signal data.', 'error')
      return
    }
    setLaunchChange(data as DetectedChangeWithCompetitor)
    setLaunchHint({
      title: opp.title,
      recommended_budget: opp.recommended_budget ?? null,
      expected_leads: opp.expected_leads ?? null,
      estimated_cpc: opp.estimated_cpc ?? null,
      confidence: opp.confidence ?? null,
      industry: opp.industry ?? null,
    })
  }

  const grouped = useMemo(() => groupByDay(recentChanges), [recentChanges])

  const competitorStats = useMemo(() => {
    const map: Record<string, { count: number; last: DetectedChangeWithCompetitor | undefined }> = {}
    for (const c of recentChanges) {
      if (!map[c.competitor_id]) map[c.competitor_id] = { count: 0, last: undefined }
      map[c.competitor_id].count++
      if (!map[c.competitor_id].last) map[c.competitor_id].last = c
    }
    return map
  }, [recentChanges])

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  if (statsLoading) return <PageSpinner />

  if (statsError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Activity size={32} className="text-gray-300" />
      <p className="text-gray-500 font-medium">Failed to load dashboard</p>
    </div>
  )

  const hasData = (stats?.competitors ?? 0) > 0

  return (
    <div className="space-y-5 max-w-7xl">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Sparkles size={16} className="text-violet-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-violet-600">AI Opportunity Command Center</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{greeting}, {firstName}</h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
            {hasData
              ? `${stats!.openOpps} revenue opportunities · ${stats!.changesToday} competitor moves today`
              : 'Load demo data to see your first AI opportunities'}
          </p>
        </div>
        {!hasData && (
          <button
            onClick={() => seedDemo.mutate()}
            disabled={seedDemo.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors self-start"
          >
            <Sparkles size={15} />
            {seedDemo.isPending ? 'Loading…' : 'Load demo data'}
          </button>
        )}
      </div>

      {/* ── Top Opportunity Hero ── */}
      {topOpp ? (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-5 text-white shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.12)_0%,_transparent_60%)]" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Top Opportunity Today</span>
                {topOpp.opportunity_score >= 75 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-400/30 text-red-100 border border-red-300/30">🔥 HOT</span>
                )}
                {topOpp.confidence != null && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white/80">
                    {Math.round(topOpp.confidence * 100)}% confidence
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold leading-snug line-clamp-1">{topOpp.title}</h2>
              {topOpp.recommended_action && (
                <p className="text-sm text-violet-100 mt-0.5 line-clamp-1 flex items-center gap-1">
                  <Zap size={12} className="text-yellow-300" />
                  {topOpp.recommended_action}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {topOpp.expected_leads != null && (
                <div className="text-center px-3 py-2 rounded-xl bg-white/10 backdrop-blur-sm">
                  <p className="text-xl font-black">{topOpp.expected_leads}</p>
                  <p className="text-[10px] text-violet-200 uppercase tracking-wide">Est. Leads</p>
                </div>
              )}
              {topOpp.recommended_budget != null && (
                <div className="text-center px-3 py-2 rounded-xl bg-white/10 backdrop-blur-sm">
                  <p className="text-xl font-black">${topOpp.recommended_budget}</p>
                  <p className="text-[10px] text-violet-200 uppercase tracking-wide">Budget/wk</p>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => handleOppLaunch(topOpp)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-violet-700 font-bold text-sm rounded-xl hover:bg-violet-50 transition-colors shadow"
                >
                  <Rocket size={14} /> Launch
                </button>
                <Link
                  to="/opportunities"
                  className="flex items-center justify-center gap-1 px-3 py-1.5 bg-white/10 text-white/80 text-xs rounded-xl hover:bg-white/20 transition-colors"
                >
                  View all <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : hasData ? (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-green-50 border border-green-200">
          <CheckCircle2 size={20} className="text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">No urgent threats right now — all systems monitoring</p>
            <p className="text-xs text-green-600 mt-0.5">New opportunities appear here as competitor signals arrive.</p>
          </div>
          <Link to="/opportunities" className="ml-auto text-xs text-green-700 hover:underline flex items-center gap-0.5 shrink-0">
            Opportunity Radar <ArrowRight size={11} />
          </Link>
        </div>
      ) : null}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Revenue Opportunities" value={stats?.openOpps ?? 0} icon={Target}        color="bg-green-500"  sub="Open opportunities"   to="/opportunities" />
        <StatCard label="Competitor Threats"     value={stats?.highSeverity ?? 0} icon={AlertTriangle} color="bg-red-500"    sub="High severity, 7 days" to="/timeline" />
        <StatCard label="Potential Customers"    value={stats?.totalLeads ?? 0}   icon={Users}         color="bg-blue-500"   sub="Total captured"       to="/leads" />
        <StatCard label="Brands Monitored"       value={stats?.competitors ?? 0}  icon={Building2}     color="bg-slate-500"  sub={`${stats?.changesToday ?? 0} moves today`} to="/competitors" />
      </div>

      {/* ── Main content: two columns ── */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">

        {/* ── Left: AI Actions + Competitor Threat Radar ── */}
        <div className="flex-1 min-w-0 w-full space-y-5">

          {/* AI Suggested Actions */}
          <AiActionsPanel />

          {/* Competitor Threat Radar */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block" />
                Competitor Threat Radar
              </h2>
              <Link to="/timeline" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                Full history <ArrowRight size={11} />
              </Link>
            </div>

            {changesLoading ? (
              <PageSpinner />
            ) : grouped.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 sm:p-10 text-center bg-white">
                <Activity size={28} className="text-gray-300 mx-auto mb-2" />
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
                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Sparkles size={14} />
                    {seedDemo.isPending ? 'Loading…' : 'Load demo data'}
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
        </div>

        {/* ── Right: One-Click Launch + Campaign Snapshot + Competitors ── */}
        <div className="w-full lg:w-72 shrink-0 space-y-4">

          {/* One-Click Campaign Launch */}
          <HotOpportunitiesPanel opportunities={topOpps} onLaunch={handleOppLaunch} />

          {/* Campaign Performance Snapshot */}
          {user && <CampaignSnapshot userId={user.id} />}

          {/* Competitor list */}
          {competitors.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-900">Competitors</h2>
                <Link to="/competitors" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                  Manage <ChevronRight size={11} />
                </Link>
              </div>
              <div className="p-2 space-y-1">
                {competitors.map((c) => (
                  <CompetitorCard
                    key={c.id}
                    competitor={c}
                    changeCount={competitorStats[c.id]?.count ?? 0}
                    lastChange={competitorStats[c.id]?.last}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Campaign modal for quick-launch from dashboard */}
      {launchChange && (
        <CampaignModal
          change={launchChange}
          open={!!launchChange}
          onClose={() => { setLaunchChange(null); setLaunchHint(undefined) }}
          opportunityHint={launchHint}
        />
      )}
    </div>
  )
}
