/**
 * MVP 2.0 — AI Revenue Opportunity Intelligence Feed
 *
 * Reads from `opportunities` (filled hourly by score-opportunities cron).
 * Each opportunity card shows revenue impact, market context, AI confidence,
 * urgency, and a direct launch path into the campaign modal.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, TrendingUp, Target, DollarSign, Zap,
  ArrowRight, Filter, Search, X, Loader2,
  ChevronDown, ChevronUp, Clock,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useOpportunities } from '../hooks/useOpportunities'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { CampaignModal } from '../components/campaigns/CampaignModal'
import type { Opportunity, DetectedChangeWithCompetitor } from '../types/database.types'
import { SourceTag, InfoTooltip, confidenceLevel, confidenceTone } from '../components/ui/MetricMeta'
import { opportunityScoreReasons } from './DashboardPage'
import { useValuePerLead } from '../hooks/useProfile'

// ── Signal source badge ───────────────────────────────────────────────────────
// Shows where this opportunity came from: Google Trends, Meta Ads, or a
// competitor website change. Read from metadata.is_standalone + signal_sources.

function SignalSourceBadge({ opp }: { opp: Opportunity }) {
  const meta = opp.metadata as Record<string, unknown> | null
  const sources = (opp.signal_sources ?? []) as Array<Record<string, unknown>>

  const hasSearchSpike  = sources.some(s => s.signal_type === 'SEARCH_SPIKE')
  const hasAdSpike      = sources.some(s => s.signal_type === 'AD_VOLUME_SPIKE')
  const hasNewCreative  = sources.some(s => s.signal_type === 'NEW_CREATIVE')
  const hasOfferRepeat  = sources.some(s => s.signal_type === 'OFFER_REPEAT')
  const isStandalone    = meta?.is_standalone === true

  const chips: { label: string; icon: React.ElementType }[] = []
  if (isStandalone && hasSearchSpike) chips.push({ label: 'Google Search', icon: TrendingUp })
  if (isStandalone && hasAdSpike) chips.push({ label: 'Meta Ad Spike', icon: Target })
  if (!isStandalone && meta?.source_competitor) chips.push({ label: `${meta.source_competitor} change`, icon: Target })
  if (hasAdSpike && !isStandalone) chips.push({ label: 'Ad spike corroborates', icon: TrendingUp })
  if (hasNewCreative) chips.push({ label: 'New creative', icon: Sparkles })
  if (hasOfferRepeat) chips.push({ label: 'Offer repeating', icon: Zap })

  if (chips.length === 0) return null
  const { label, icon: Icon } = chips[0]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
      <Icon size={13} className="text-primary" />
      {label}
    </span>
  )
}

// ── Budget tier simulator ─────────────────────────────────────────────────────

function BudgetTiers({ opp }: { opp: Opportunity }) {
  const [open, setOpen] = useState(false)
  const recBudget = opp.recommended_budget
  const expLeads  = opp.expected_leads
  const cpc       = opp.estimated_cpc

  if (!recBudget || !cpc || cpc <= 0) return null

  const tiers = [
    { label: 'Conservative', budget: Math.round(recBudget * 0.4), tag: 'Weak impact', active: false },
    { label: 'Recommended',  budget: recBudget,                    tag: 'Optimal',      active: true  },
    { label: 'Aggressive',   budget: Math.round(recBudget * 2.5),  tag: 'Diminishing returns', active: false },
  ]

  const leadsFor = (budget: number) => {
    if (!expLeads) return '—'
    const ratio = budget / recBudget
    const scale = ratio <= 1 ? ratio : 1 + Math.sqrt(ratio - 1) * 0.7
    return Math.max(1, Math.round(expLeads * scale))
  }

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] text-on-surface-variant hover:text-on-surface transition-colors"
      >
        <DollarSign size={11} />
        Budget scenarios
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-border-subtle overflow-hidden text-xs">
          <div className="grid grid-cols-3 bg-surface-container-low text-[10px] uppercase tracking-wide text-on-surface-variant px-2 py-1.5 border-b border-border-subtle">
            <span>Budget/day</span><span className="text-center">Est. leads</span><span className="text-right">Impact</span>
          </div>
          {tiers.map(t => (
            <div key={t.label} className={`grid grid-cols-3 px-2 py-2 border-b border-border-subtle last:border-0 ${t.active ? 'bg-indigo-tint' : ''}`}>
              <span className={`flex items-center gap-1.5 ${t.active ? 'font-bold text-primary' : 'text-on-surface-variant'}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.active ? 'bg-primary' : 'bg-gray-400'}`} />
                ${t.budget}/day
              </span>
              <span className={`text-center ${t.active ? 'font-bold text-primary' : 'text-on-surface-variant'}`}>{leadsFor(t.budget)}</span>
              <span className="text-right text-[10px] text-on-surface-variant">{t.tag}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Opportunity trend + AI recommendation (bottom section) ────────────────────

function OpportunityTrendChart({ opportunities }: { opportunities: Opportunity[] }) {
  const days = useMemo(() => {
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - (6 - i))
      return { date: d, label: d.toLocaleDateString(undefined, { weekday: 'short' }), count: 0 }
    })
    for (const opp of opportunities) {
      const created = new Date(opp.created_at)
      created.setHours(0, 0, 0, 0)
      const bucket = buckets.find(b => b.date.getTime() === created.getTime())
      if (bucket) bucket.count++
    }
    return buckets
  }, [opportunities])

  const max = Math.max(1, ...days.map(d => d.count))

  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-soft">
      <h3 className="font-display font-semibold text-on-surface mb-4 flex items-center gap-2">
        <TrendingUp size={16} className="text-primary" />
        Opportunity Trend Analysis
      </h3>
      <div className="h-40 flex items-end justify-between gap-2 mb-2">
        {days.map(d => (
          <div key={d.label + d.date.getTime()} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className="w-full bg-primary/20 hover:bg-primary/30 rounded-t transition-all"
              style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
              title={`${d.count} opportunit${d.count === 1 ? 'y' : 'ies'}`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        {days.map(d => <span key={d.label + d.date.getTime()}>{d.label}</span>)}
      </div>
    </div>
  )
}

function AiRecommendationCard({ opportunities }: { opportunities: Opportunity[] }) {
  const insight = useMemo(() => {
    if (opportunities.length === 0) return null
    const byIndustry = new Map<string, number>()
    for (const o of opportunities) {
      const key = o.industry ?? 'General'
      byIndustry.set(key, (byIndustry.get(key) ?? 0) + 1)
    }
    const [topIndustry, topCount] = [...byIndustry.entries()].sort((a, b) => b[1] - a[1])[0]
    const totalLeads = opportunities.reduce((s, o) => s + (o.expected_leads ?? 0), 0)
    const avgConf = Math.round(
      opportunities.reduce((s, o) => s + (o.confidence ?? 0), 0) / opportunities.length * 100
    )
    return { topIndustry, topCount, totalLeads, avgConf }
  }, [opportunities])

  if (!insight) return null

  return (
    <div className="bg-ink text-white rounded-xl p-5 shadow-soft-lg flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={15} className="text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-white/70">AI Recommendation</span>
      </div>
      <p className="text-sm text-white/90 leading-relaxed italic flex-1">
        "Your current Top {insight.topCount} opportunities are concentrated in{' '}
        <strong className="not-italic text-white">{insight.topIndustry}</strong>, with a combined{' '}
        <strong className="not-italic text-white">{insight.totalLeads}</strong> predicted leads. We recommend
        allocating additional budget there before competitors respond."
      </p>
      <div className="flex items-center gap-2 mt-4 mb-3">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-success bg-success/15 px-2 py-1 rounded-full">
          {confidenceLevel(insight.avgConf / 100) ?? '—'}
        </span>
        <span className="text-[11px] text-white/50">Average confidence · AI calculated</span>
      </div>
      <Link
        to="/opportunities"
        className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 bg-primary hover:opacity-90 rounded-xl font-bold text-sm transition-all"
      >
        Apply All Optimizations
      </Link>
    </div>
  )
}

// ── Opportunity card ──────────────────────────────────────────────────────────

const TIER_META = {
  urgent: { label: 'URGENT',       badgeBg: 'bg-red-tint',    badgeText: 'text-danger' },
  normal: { label: 'AI GENERATED', badgeBg: 'bg-orange-tint', badgeText: 'text-warning' },
}

// Small circular score ring, mirrors the reference design's confidence ring.
function ScoreRing({ score }: { score: number }) {
  const r = 16
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100)
  const color = score >= 75 ? '#1E8A5C' : score >= 50 ? '#D98A2B' : '#5B6A63'
  return (
    <div className="relative w-[38px] h-[38px] shrink-0">
      <svg viewBox="0 0 38 38" className="w-full h-full -rotate-90">
        <circle cx="19" cy="19" r={r} fill="none" stroke="#EFEDE5" strokeWidth="4" />
        <circle
          cx="19" cy="19" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold text-on-surface">
        {Math.round(score)}
      </div>
    </div>
  )
}

function OpportunityCard({
  opp,
  onLaunch,
  onDismiss,
  busy,
}: {
  opp: Opportunity
  onLaunch: (opp: Opportunity) => void
  onDismiss: (opp: Opportunity) => void
  busy: boolean
}) {
  const valuePerLead = useValuePerLead()
  const sources = (opp.signal_sources ?? []) as Array<Record<string, unknown>>
  const topSignal = sources.find(s => s.growth_pct != null)
  const growthPct = topSignal?.growth_pct as number | undefined

  const estRevenueValue = opp.expected_leads != null ? opp.expected_leads * valuePerLead : null
  // recommended_budget is a DAILY figure (see score-opportunities) — weekly spend is ×7
  const roiMultiplier = opp.expected_leads != null && opp.recommended_budget != null && opp.recommended_budget > 0
    ? ((opp.expected_leads * valuePerLead) / (opp.recommended_budget * 7)).toFixed(1)
    : null

  const isUrgent = opp.opportunity_score >= 85 ||
    (opp.expires_at != null && new Date(opp.expires_at) < new Date(Date.now() + 24 * 3600000))
  const tier = isUrgent ? TIER_META.urgent : TIER_META.normal
  const confLevel = confidenceLevel(opp.confidence)
  const scoreReasons = opportunityScoreReasons(opp)

  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-soft hover:shadow-soft-md transition-shadow relative">
      <button
        onClick={() => onDismiss(opp)}
        title="Dismiss"
        className="absolute top-3 right-3 text-on-surface-variant/40 hover:text-on-surface-variant p-1 rounded-lg hover:bg-surface-container-low transition-colors"
      >
        <X size={13} />
      </button>

      <div className="flex items-center justify-between gap-2 mb-3 pr-5">
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wide ${tier.badgeBg} ${tier.badgeText}`}>
          {tier.label}
        </span>
        <span className="inline-flex items-center gap-1">
          <ScoreRing score={opp.opportunity_score} />
          <InfoTooltip title="Why this score?">
            {scoreReasons.length > 0 ? (
              <span className="block space-y-1">
                {scoreReasons.map(r => <span key={r} className="block">• {r}</span>)}
              </span>
            ) : (
              'A 0–100 ranking combining competitor activity, search demand, signal strength, and recency.'
            )}
          </InfoTooltip>
        </span>
      </div>

      <p className="text-[10px] font-mono uppercase text-on-surface-variant tracking-wider mb-1">
        {opp.market_name ?? `${opp.industry ?? 'General'} · ${opp.location ?? 'Global'}`}
        {growthPct != null && <span className="text-success ml-1.5">+{Math.round(growthPct)}% demand</span>}
      </p>
      <h3 className="font-display font-semibold text-on-surface text-base leading-snug mb-2">{opp.title}</h3>
      {opp.description && (
        <p className="text-sm text-on-surface-variant mb-4 line-clamp-2">{opp.description}</p>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-surface-container-low rounded-lg p-3">
          <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
            Estimated Revenue
            <InfoTooltip title="How Estimated Revenue is calculated">
              Estimated Leads ({opp.expected_leads ?? '—'}) × your configured Value Per Lead (${valuePerLead}).
              Becomes Actual Revenue once campaigns generate real results.
            </InfoTooltip>
          </p>
          <p className="font-mono text-lg font-bold text-on-surface">
            {estRevenueValue != null ? `$${estRevenueValue.toLocaleString()}` : '—'}
          </p>
          <SourceTag source="estimated" className="mt-1.5" />
        </div>
        <div className="bg-surface-container-low rounded-lg p-3">
          <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
            Confidence
            <InfoTooltip title="How Confidence is determined">
              Based on how many independent signals corroborate this opportunity. Shown as
              High / Medium / Low until enough historical campaign data exists to compute it precisely.
            </InfoTooltip>
          </p>
          <p className={`font-mono text-lg font-bold ${confLevel ? confidenceTone(confLevel) : 'text-on-surface-variant'}`}>{confLevel ?? '—'}</p>
          <SourceTag source="ai" className="mt-1.5" />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-on-surface-variant mb-3 pt-3 pb-1 border-t border-dashed border-border-subtle">
        <span>Estimated Leads <strong className="text-on-surface">{opp.expected_leads ?? '—'}</strong></span>
        <span>Estimated ROI <strong className="text-success">{roiMultiplier != null ? `${roiMultiplier}x` : '—'}</strong></span>
      </div>

      {opp.recommended_action && (
        <p className="text-xs text-on-surface-variant mb-3 flex items-start gap-1.5">
          <Sparkles size={12} className="shrink-0 mt-0.5 text-primary" />
          <span><strong className="text-on-surface">AI Why:</strong> {opp.recommended_action}</span>
        </p>
      )}

      {opp.expires_at && (
        <div className={`flex items-center gap-1.5 mb-3 text-xs font-semibold px-2.5 py-1.5 rounded-lg ${
          new Date(opp.expires_at) < new Date(Date.now() + 24 * 3600000)
            ? 'text-danger bg-red-tint' : 'text-warning bg-orange-tint'}`}
        >
          <Clock size={11} />
          {new Date(opp.expires_at) < new Date(Date.now() + 24 * 3600000)
            ? 'Expires in less than 24h — act now'
            : `Window closes in ${Math.round((new Date(opp.expires_at).getTime() - Date.now()) / 86400000)}d`}
        </div>
      )}

      <BudgetTiers opp={opp} />

      <div className="flex items-center justify-between gap-3">
        <SignalSourceBadge opp={opp} />
        <button
          onClick={() => onLaunch(opp)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 bg-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-2.5 px-5 rounded-xl transition-all shrink-0"
        >
          {busy ? <><Loader2 size={14} className="animate-spin" /> Loading…</> : <>Launch Now <ArrowRight size={14} /></>}
        </button>
      </div>
    </div>
  )
}

type ScoreFilter = 'all' | 'highConfidence' | 'maxRevenue' | 'lowCac'

export function OpportunityFeedPage() {
  const [statusFilter] = useState<'open'>('open')
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const { data: opportunities = [], isLoading, refetch, isRefetching } = useOpportunities({ status: statusFilter })
  const feedValuePerLead = useValuePerLead()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { toast } = useToast()

  const [activeChange, setActiveChange] = useState<DetectedChangeWithCompetitor | null>(null)
  const [activeOppHint, setActiveOppHint] = useState<{
    title?: string
    recommended_budget?: number | null
    expected_leads?:     number | null
    estimated_cpc?:      number | null
    estimated_cpl?:      number | null
    confidence?:         number | null
    industry?:           string | null
  } | undefined>(undefined)
  const [loadingOppId, setLoadingOppId] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`opportunities-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'opportunities', filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['opportunities'] })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, queryClient])

  async function handleLaunch(opp: Opportunity) {
    const meta     = (opp.metadata as Record<string, unknown> | null) ?? {}
    const sourceId = meta.source_change_id as string | undefined

    if (!sourceId) {
      toast(
        'Go to Timeline → pick a competitor move → click "Launch Counter Campaign".',
        'info',
        'Market signal — no competitor change linked',
      )
      return
    }
    setLoadingOppId(opp.id)
    try {
      const { data, error } = await supabase
        .from('detected_changes')
        .select('*, competitors(id, name, website_url, industry), monitored_pages(url, page_type)')
        .eq('id', sourceId)
        .single()
      if (error || !data) {
        toast('Could not load the source signal — it may have been pruned.', 'error', 'Signal not found')
        return
      }
      setActiveChange(data as DetectedChangeWithCompetitor)
      setActiveOppHint({
        title:              opp.title,
        recommended_budget: opp.recommended_budget ?? null,
        expected_leads:     opp.expected_leads     ?? null,
        estimated_cpc:      opp.estimated_cpc      ?? null,
        estimated_cpl:      opp.estimated_cpl      ?? null,
        confidence:         opp.confidence         ?? null,
        industry:           opp.industry           ?? null,
      })
    } finally {
      setLoadingOppId(null)
    }
  }

  const revenueOf = (o: Opportunity) => (o.expected_leads ?? 0) * feedValuePerLead
  const revenueP75 = useMemo(() => {
    if (opportunities.length === 0) return 0
    const sorted = [...opportunities].map(revenueOf).sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1]
  }, [opportunities])
  const cpcP25 = useMemo(() => {
    const withCpc = opportunities.filter(o => o.estimated_cpc != null && o.estimated_cpc > 0)
    if (withCpc.length === 0) return null
    const sorted = withCpc.map(o => o.estimated_cpc as number).sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length * 0.25)]
  }, [opportunities])

  const filteredOpportunities = useMemo(() => {
    let list = opportunities
    if (scoreFilter === 'highConfidence') list = list.filter(o => (o.confidence ?? 0) >= 0.75)
    else if (scoreFilter === 'maxRevenue') list = list.filter(o => revenueOf(o) >= revenueP75 && revenueP75 > 0)
    else if (scoreFilter === 'lowCac') list = list.filter(o => cpcP25 != null && (o.estimated_cpc ?? Infinity) <= cpcP25)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(o =>
        (o.title ?? '').toLowerCase().includes(q) ||
        (o.industry ?? '').toLowerCase().includes(q) ||
        (o.location ?? '').toLowerCase().includes(q) ||
        (o.market_name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [opportunities, scoreFilter, searchQuery, revenueP75, cpcP25])

  async function handleDismiss(opp: Opportunity) {
    const { error } = await supabase
      .from('opportunities')
      .update({ status: 'dismissed' })
      .eq('id', opp.id)
    if (error) {
      toast('Failed to dismiss opportunity', 'error')
      return
    }
    queryClient.invalidateQueries({ queryKey: ['opportunities'] })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-6">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-on-surface mb-1">Opportunities</h1>
          <p className="text-sm text-on-surface-variant">
            Ranked by revenue potential — act on the top of the list first.
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <div className="relative">
            <button
              onClick={() => setFilterOpen(v => !v)}
              className="border border-outline-variant bg-surface-card hover:bg-surface-container-low rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-1.5 text-on-surface-variant"
            >
              <Filter size={14} /> Filter
            </button>
            {filterOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-surface-card border border-border-subtle rounded-xl shadow-soft-lg p-3 z-10">
                <label className="relative block">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search opportunities…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="border border-outline-variant bg-surface-container-low rounded-lg pl-9 pr-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </label>
              </div>
            )}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center gap-1.5 bg-primary hover:opacity-90 disabled:opacity-60 text-white rounded-xl px-4 py-2 text-sm font-bold transition-all"
          >
            {isRefetching ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Generate Now
          </button>
        </div>
      </div>

      {/* Score filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {[
          { key: 'all',            label: 'All Channels' },
          { key: 'highConfidence', label: 'High Confidence' },
          { key: 'maxRevenue',     label: 'Max Revenue' },
          { key: 'lowCac',         label: 'Low CAC' },
        ].map(stat => (
          <button
            key={stat.key}
            onClick={() => setScoreFilter(stat.key as ScoreFilter)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
              scoreFilter === stat.key
                ? 'bg-primary text-white shadow-soft'
                : 'bg-surface-card border border-outline-variant text-on-surface-variant hover:border-primary/40'
            }`}
          >
            {stat.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-on-surface-variant">
          Showing {filteredOpportunities.length} active AI recommendation{filteredOpportunities.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="text-center py-16 text-on-surface-variant">
          <Search className="mx-auto mb-3 animate-pulse" size={32} />
          Scanning signals…
        </div>
      ) : filteredOpportunities.length === 0 && opportunities.length > 0 ? (
        <div className="text-center py-12 text-on-surface-variant">
          <Filter size={28} className="mx-auto mb-2 text-on-surface-variant/40" />
          <p className="text-sm font-medium">No opportunities match your filters.</p>
          <button onClick={() => { setScoreFilter('all'); setSearchQuery('') }} className="mt-2 text-xs text-primary hover:underline">Clear filters</button>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="bg-indigo-tint border border-primary/10 rounded-xl p-12 text-center">
          <Zap size={48} className="mx-auto mb-4 text-primary" />
          <h2 className="text-xl font-bold text-on-surface mb-2">Your first opportunity is coming soon</h2>
          <p className="text-sm text-on-surface-variant mb-5 max-w-md mx-auto">
            DigiPromix is scanning competitor activity, search trends, and ad spend signals. As real signals
            start flowing, scored opportunities will appear here in real-time.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center max-w-md mx-auto">
            <Link to="/competitors" className="bg-primary hover:opacity-90 text-white text-sm font-bold py-2.5 px-5 rounded-xl">
              Add a competitor
            </Link>
            <Link to="/settings" className="border border-outline-variant hover:bg-surface-container-low text-on-surface text-sm font-bold py-2.5 px-5 rounded-xl">
              Connect ad accounts
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredOpportunities.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              onLaunch={handleLaunch}
              onDismiss={handleDismiss}
              busy={loadingOppId === opp.id}
            />
          ))}
        </div>
      )}

      {/* Trend analysis + AI recommendation */}
      {opportunities.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-6">
          <div className="xl:col-span-2">
            <OpportunityTrendChart opportunities={opportunities} />
          </div>
          <AiRecommendationCard opportunities={opportunities} />
        </div>
      )}

      {activeChange && (
        <CampaignModal
          change={activeChange}
          open={!!activeChange}
          onClose={() => { setActiveChange(null); setActiveOppHint(undefined) }}
          opportunityHint={activeOppHint}
        />
      )}

      {/* Mobile sticky action bar */}
      {opportunities.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-surface-card/95 backdrop-blur border-t border-border-subtle lg:hidden z-30">
          <button
            onClick={() => opportunities[0] && handleLaunch(opportunities[0])}
            disabled={!!loadingOppId}
            className="w-full bg-primary hover:opacity-90 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-soft"
          >
            {loadingOppId ? <><Loader2 size={16} className="animate-spin" />Loading…</> : <>⚡ Launch Top Opportunity <ArrowRight size={16} /></>}
          </button>
        </div>
      )}
    </div>
  )
}
