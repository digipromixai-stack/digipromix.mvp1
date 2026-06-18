import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ChangeTypeBadge, SeverityBadge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { timeAgo } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import { useAiRecommendations, useApplyRecommendation, useDismissRecommendation } from '../hooks/useAiRecommendations'
import { CampaignModal } from '../components/campaigns/CampaignModal'
import {
  Activity, Building2,
  ExternalLink, Sparkles, Megaphone, DollarSign,
  FileText, Layout, RefreshCw, ArrowRight, Target,
  AlertTriangle, CheckCircle2, Zap, Rocket, TrendingUp,
  ChevronRight, X, Users, Brain, ShieldAlert, BarChart3,
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
  promotion:        { icon: Megaphone,  color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-400' },
  price_change:     { icon: DollarSign, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-400' },
  new_landing_page: { icon: Layout,     color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-400' },
  new_blog_post:    { icon: FileText,   color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-400' },
  banner_change:    { icon: Sparkles,   color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-400' },
  content_change:   { icon: RefreshCw,  color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-300' },
}

const ACTION_META: Record<RecommendationAction, { label: string; color: string; bg: string; icon: typeof Zap }> = {
  launch_campaign:  { label: 'Launch Campaign',   color: 'text-green-700',  bg: 'bg-green-50',  icon: Rocket     },
  adjust_budget:    { label: 'Adjust Budget',     color: 'text-blue-700',   bg: 'bg-blue-50',   icon: DollarSign },
  pause_campaign:   { label: 'Pause Campaign',    color: 'text-red-700',    bg: 'bg-red-50',    icon: AlertTriangle },
  change_creative:  { label: 'New Creative',      color: 'text-purple-700', bg: 'bg-purple-50', icon: Sparkles   },
  change_audience:  { label: 'Update Audience',   color: 'text-indigo-700', bg: 'bg-indigo-50', icon: Target     },
  scale_campaign:   { label: 'Scale Up',          color: 'text-emerald-700',bg: 'bg-emerald-50',icon: TrendingUp },
  reactivate:       { label: 'Reactivate',        color: 'text-amber-700',  bg: 'bg-amber-50',  icon: Zap        },
  setup_tracking:   { label: 'Setup Tracking',    color: 'text-gray-700',   bg: 'bg-gray-50',   icon: Activity   },
}

// ── IntelligenceMetric ────────────────────────────────────────────────────────

function IntelligenceMetric({
  label, value, icon: Icon, color, sub, to, highlight,
}: {
  label: string; value: number | string; icon: typeof Activity
  color: string; sub?: string; to?: string; highlight?: boolean
}) {
  const content = (
    <div className={`bg-white rounded-xl border px-4 py-4 flex items-center gap-4 transition-all
      ${highlight ? 'border-violet-200 ring-1 ring-violet-100 shadow-sm' : 'border-gray-200'}
      ${to ? 'hover:border-blue-200 hover:shadow-sm cursor-pointer' : ''}`}>
      <div className={`flex items-center justify-center w-11 h-11 rounded-xl ${color} shrink-0`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{label}</p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{content}</Link> : content
}

// ── TopPriorityActionCard ─────────────────────────────────────────────────────
// Shows the single most important AI action — prominently, not buried in a list.

function TopPriorityActionCard() {
  const { data: recs = [], isLoading } = useAiRecommendations()
  const apply = useApplyRecommendation()
  const dismiss = useDismissRecommendation()

  if (isLoading || recs.length === 0) return null

  const top = recs[0]
  const am = ACTION_META[top.action_type] ?? ACTION_META.launch_campaign
  const Icon = am.icon
  const remainingCount = recs.length - 1

  return (
    <div className="bg-gradient-to-r from-violet-50 via-indigo-50 to-blue-50 border border-violet-200 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-600 shrink-0 shadow-md">
        <Icon size={22} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-600 flex items-center gap-1">
            <Brain size={10} /> AI Priority Action
          </span>
          <span className="text-[10px] font-bold uppercase text-gray-500">{am.label}</span>
          {top.confidence != null && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 border border-violet-200 text-violet-700">
              {Math.round(top.confidence * 100)}% confidence
            </span>
          )}
        </div>
        <p className="text-base font-bold text-gray-900 leading-snug">{top.recommendation}</p>
        {top.campaigns && (
          <p className="text-xs text-gray-500 mt-1">Campaign: {top.campaigns.campaign_name}</p>
        )}
        {remainingCount > 0 && (
          <Link to="/opportunities" className="inline-flex items-center gap-0.5 text-xs text-violet-600 hover:underline mt-1">
            +{remainingCount} more AI suggestions <ChevronRight size={11} />
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <button
          onClick={() => apply.mutate(top.id)}
          disabled={apply.isPending}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          Apply Now
        </button>
        <button
          onClick={() => dismiss.mutate(top.id)}
          disabled={dismiss.isPending}
          className="px-4 py-1.5 border border-gray-200 bg-white text-gray-500 text-xs font-medium rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ── MarketSignalsPanel ────────────────────────────────────────────────────────
// Compact intelligence view of key competitor moves. NOT a full activity feed.
// Purpose: "what's happening in the market" at a glance.

function MarketSignalsPanel({
  changes,
  highSeverityCount,
}: {
  changes: DetectedChangeWithCompetitor[]
  highSeverityCount: number
}) {
  const threatLevel = highSeverityCount >= 3 ? 'HIGH' : highSeverityCount >= 1 ? 'MEDIUM' : 'LOW'
  const TC = {
    HIGH:   { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',   dot: 'bg-red-500'   },
    MEDIUM: { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
    LOW:    { bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
  }[threatLevel]

  const keySignals = [
    ...changes.filter(c => c.severity === 'high'),
    ...changes.filter(c => c.severity === 'medium'),
  ].slice(0, 5)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <ShieldAlert size={14} className="text-gray-500" />
          <span className="text-sm font-bold text-gray-900">Competitor Intelligence</span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${TC.bg} ${TC.border} ${TC.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${TC.dot} animate-pulse`} />
            {threatLevel} THREAT
          </span>
        </div>
        <Link to="/timeline" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
          Full history <ArrowRight size={11} />
        </Link>
      </div>

      {keySignals.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <CheckCircle2 size={24} className="mx-auto mb-2 text-green-400" />
          <p className="text-sm font-medium text-gray-500">No significant competitor moves</p>
          <p className="text-xs text-gray-400 mt-0.5">Market is calm — good time to capture share</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {keySignals.map((change) => {
            const meta = CHANGE_META[change.change_type] ?? CHANGE_META.content_change
            const Icon = meta.icon
            const favicon = faviconUrl(change.competitors?.website_url ?? '')
            return (
              <div key={change.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${meta.bg} shrink-0 mt-0.5`}>
                  <Icon size={13} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 line-clamp-1">{change.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {favicon && (
                      <img src={favicon} alt="" className="w-3.5 h-3.5 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    )}
                    <span className="text-xs text-gray-500">{change.competitors?.name}</span>
                    <SeverityBadge severity={change.severity} />
                    <span className="text-xs text-gray-300">{timeAgo(change.detected_at)}</span>
                  </div>
                </div>
                <Link
                  to={`/timeline/${change.competitor_id}`}
                  className="shrink-0 text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  View <ExternalLink size={9} />
                </Link>
              </div>
            )
          })}
          {changes.length > 5 && (
            <div className="px-4 py-2.5 text-center">
              <Link to="/timeline" className="text-xs text-blue-600 hover:underline">
                +{changes.length - 5} more signals in timeline →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── HotOpportunitiesPanel ─────────────────────────────────────────────────────

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
          <span className="text-sm font-bold text-gray-900">Quick Launch</span>
        </div>
        <Link to="/opportunities" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
          All <ChevronRight size={11} />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {top3.map((opp) => (
          <div key={opp.id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                {opp.opportunity_score >= 75 && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">🔥 HOT</span>
                )}
                {opp.confidence != null && (
                  <span className="text-[10px] text-gray-400">{Math.round(opp.confidence * 100)}% conf.</span>
                )}
              </div>
              <p className="text-sm font-semibold text-gray-900 line-clamp-1">{opp.title}</p>
              {opp.expected_leads != null && (
                <p className="text-xs text-green-600 font-medium mt-0.5">~{opp.expected_leads} predicted leads</p>
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

// ── CompetitorsList ───────────────────────────────────────────────────────────

function CompetitorsList({
  competitors,
  recentChanges,
}: {
  competitors: Pick<Competitor, 'id' | 'name' | 'website_url'>[]
  recentChanges: DetectedChangeWithCompetitor[]
}) {
  const competitorStats = useMemo(() => {
    const map: Record<string, { count: number; last: DetectedChangeWithCompetitor | undefined }> = {}
    for (const c of recentChanges) {
      if (!map[c.competitor_id]) map[c.competitor_id] = { count: 0, last: undefined }
      map[c.competitor_id].count++
      if (!map[c.competitor_id].last) map[c.competitor_id].last = c
    }
    return map
  }, [recentChanges])

  if (competitors.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-gray-500" />
          <span className="text-sm font-bold text-gray-900">Competitors</span>
        </div>
        <Link to="/competitors" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
          Manage <ChevronRight size={11} />
        </Link>
      </div>
      <div className="p-2 space-y-1">
        {competitors.slice(0, 6).map((c) => {
          const favicon = faviconUrl(c.website_url)
          const stats = competitorStats[c.id]
          const meta = stats?.last ? (CHANGE_META[stats.last.change_type] ?? CHANGE_META.content_change) : null
          return (
            <Link
              key={c.id}
              to={`/timeline/${c.id}`}
              className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors bg-white"
            >
              {favicon ? (
                <img src={favicon} alt="" className="w-6 h-6 rounded-md" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center">
                  <Building2 size={12} className="text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                {stats?.last && meta ? (
                  <p className={`text-xs ${meta.color} truncate`}>{stats.last.title}</p>
                ) : (
                  <p className="text-xs text-gray-400">Monitoring active</p>
                )}
              </div>
              {(stats?.count ?? 0) > 0 && (
                <span className="text-xs font-bold text-gray-400 shrink-0">{stats!.count}</span>
              )}
            </Link>
          )
        })}
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
      const [competitors, changesToday, highSeverity, openOpps, totalLeads, oppsDetail] = await Promise.all([
        supabase.from('competitors').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('is_active', true),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('detected_at', todayStart.toISOString()),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('severity', 'high').gte('detected_at', new Date(Date.now() - 7 * 86400000).toISOString()),
        supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'open'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
        supabase.from('opportunities').select('expected_leads, confidence').eq('user_id', user!.id).eq('status', 'open'),
      ])
      const oppsList = oppsDetail.data ?? []
      const predictedLeads = oppsList.reduce((s, o) => s + (o.expected_leads ?? 0), 0)
      const avgConfidence = oppsList.length
        ? Math.round(oppsList.reduce((s, o) => s + (o.confidence ?? 0), 0) / oppsList.length * 100)
        : 0
      return {
        competitors: competitors.count ?? 0,
        changesToday: changesToday.count ?? 0,
        highSeverity: highSeverity.count ?? 0,
        openOpps: openOpps.count ?? 0,
        totalLeads: totalLeads.count ?? 0,
        predictedLeads,
        avgConfidence,
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

  // Competitor market signals (recent high/medium severity changes)
  const { data: recentChanges = [] } = useQuery({
    queryKey: ['detected_changes', 'market_signals', user?.id],
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
    refetchInterval: 60000,
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

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const hasData = (stats?.competitors ?? 0) > 0

  if (statsLoading) return <PageSpinner />

  if (statsError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Activity size={32} className="text-gray-300" />
      <p className="text-gray-500 font-medium">Failed to load dashboard</p>
    </div>
  )

  return (
    <div className="space-y-5 max-w-7xl">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Brain size={15} className="text-violet-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-violet-600">AI Revenue Intelligence</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{greeting}, {firstName}</h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
            {hasData
              ? `${stats!.openOpps} revenue opportunities · AI monitoring ${stats!.competitors} competitor${stats!.competitors !== 1 ? 's' : ''} · ${stats!.changesToday} signals today`
              : 'Load demo data to see your first AI-detected opportunities'}
          </p>
        </div>
        {!hasData && (
          <button
            onClick={() => seedDemo.mutate()}
            disabled={seedDemo.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-60 transition-colors self-start shadow-sm"
          >
            <Sparkles size={15} />
            {seedDemo.isPending ? 'Loading…' : 'Load demo data'}
          </button>
        )}
      </div>

      {/* ── Top Opportunity Hero ── */}
      {topOpp ? (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-700 via-indigo-700 to-blue-700 p-5 sm:p-6 text-white shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15)_0%,_transparent_60%)]" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10" />
          <div className="relative">
            {/* Header row */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Top Revenue Opportunity Now</span>
              {topOpp.opportunity_score >= 75 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-400/30 text-red-100 border border-red-300/30 flex items-center gap-1">
                  🔥 HOT MARKET
                </span>
              )}
              {topOpp.confidence != null && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 text-white/80 font-semibold">
                  {Math.round(topOpp.confidence * 100)}% AI confidence
                </span>
              )}
              {topOpp.expires_at && new Date(topOpp.expires_at) < new Date(Date.now() + 48 * 3600000) && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/30 text-amber-100 border border-amber-300/30 flex items-center gap-1">
                  <Zap size={9} /> Expires soon
                </span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold leading-snug">{topOpp.title}</h2>
                {topOpp.description && (
                  <p className="text-sm text-violet-200 mt-1 line-clamp-2">{topOpp.description}</p>
                )}
                {topOpp.recommended_action && (
                  <p className="text-sm text-yellow-200 mt-2 flex items-center gap-1.5 font-medium">
                    <Sparkles size={13} className="text-yellow-300 shrink-0" />
                    {topOpp.recommended_action}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap sm:flex-nowrap">
                {topOpp.expected_leads != null && (
                  <div className="text-center px-3 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
                    <p className="text-2xl font-black">{topOpp.expected_leads}</p>
                    <p className="text-[10px] text-violet-200 uppercase tracking-wide">Pred. Leads</p>
                  </div>
                )}
                {topOpp.recommended_budget != null && (
                  <div className="text-center px-3 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10">
                    <p className="text-2xl font-black">${topOpp.recommended_budget}</p>
                    <p className="text-[10px] text-violet-200 uppercase tracking-wide">Budget/wk</p>
                  </div>
                )}
                {topOpp.expected_leads != null && topOpp.recommended_budget != null && topOpp.recommended_budget > 0 && (
                  <div className="text-center px-3 py-2.5 rounded-xl bg-green-400/20 backdrop-blur-sm border border-green-300/20">
                    <p className="text-2xl font-black text-green-300">
                      {Math.round((topOpp.expected_leads * 80) / (topOpp.recommended_budget * 4))}×
                    </p>
                    <p className="text-[10px] text-green-200 uppercase tracking-wide">Est. ROI</p>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => handleOppLaunch(topOpp)}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-white text-violet-700 font-bold text-sm rounded-xl hover:bg-violet-50 transition-colors shadow-md"
                  >
                    <Rocket size={14} /> Launch Now
                  </button>
                  <Link
                    to="/opportunities"
                    className="flex items-center justify-center gap-1 px-3 py-1.5 bg-white/10 text-white/80 text-xs rounded-xl hover:bg-white/20 transition-colors"
                  >
                    All opportunities <ArrowRight size={11} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : hasData ? (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-green-50 border border-green-200">
          <CheckCircle2 size={20} className="text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">No urgent opportunities right now — all systems monitoring</p>
            <p className="text-xs text-green-600 mt-0.5">New opportunities appear here as market signals arrive.</p>
          </div>
          <Link to="/opportunities" className="ml-auto text-xs text-green-700 hover:underline flex items-center gap-0.5 shrink-0">
            Opportunity Radar <ArrowRight size={11} />
          </Link>
        </div>
      ) : null}

      {/* ── AI Priority Action ── */}
      <TopPriorityActionCard />

      {/* ── Intelligence Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IntelligenceMetric
          label="Revenue Opportunities"
          value={stats?.openOpps ?? 0}
          icon={Target}
          color="bg-violet-600"
          sub="Open AI signals"
          to="/opportunities"
          highlight
        />
        <IntelligenceMetric
          label="Predicted Leads"
          value={stats?.predictedLeads ?? 0}
          icon={Users}
          color="bg-green-500"
          sub="Across open opps"
          to="/opportunities"
        />
        <IntelligenceMetric
          label="AI Confidence"
          value={stats?.avgConfidence ? `${stats.avgConfidence}%` : '—'}
          icon={BarChart3}
          color="bg-blue-500"
          sub="Avg across signals"
        />
        <IntelligenceMetric
          label="Competitor Threats"
          value={stats?.highSeverity ?? 0}
          icon={AlertTriangle}
          color="bg-red-500"
          sub="High severity, 7 days"
          to="/timeline"
        />
      </div>

      {/* ── Main: 2-column layout ── */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">

        {/* ── Left: Competitor Intelligence Panel ── */}
        <div className="flex-1 min-w-0 w-full">
          <MarketSignalsPanel
            changes={recentChanges}
            highSeverityCount={stats?.highSeverity ?? 0}
          />
        </div>

        {/* ── Right: Quick Launch + Competitors ── */}
        <div className="w-full lg:w-72 shrink-0 space-y-4">
          <HotOpportunitiesPanel opportunities={topOpps} onLaunch={handleOppLaunch} />
          <CompetitorsList competitors={competitors} recentChanges={recentChanges} />

          {/* CTA to full Opportunity Radar */}
          <Link
            to="/opportunities"
            className="flex items-center justify-between px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 transition-colors shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={15} />
              <span className="text-sm font-bold">Full Opportunity Radar</span>
            </div>
            <ArrowRight size={15} />
          </Link>

          {/* Demo data prompt when empty */}
          {!hasData && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <Sparkles size={20} className="mx-auto mb-2 text-blue-500" />
              <p className="text-sm font-semibold text-blue-900 mb-1">No competitors yet</p>
              <p className="text-xs text-blue-600 mb-3">Add competitors to start getting AI intelligence</p>
              <Link to="/competitors" className="inline-block text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Add Competitor
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Campaign modal */}
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
