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
  ArrowRight, Filter, Search, RefreshCcw, X, Loader2, Radio,
  ChevronDown, ChevronUp, Brain, Clock, ShieldAlert,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useOpportunities } from '../hooks/useOpportunities'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { CampaignModal } from '../components/campaigns/CampaignModal'
import type { Opportunity, DetectedChangeWithCompetitor } from '../types/database.types'

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
            <span>Budget/wk</span><span className="text-center">Est. leads</span><span className="text-right">Impact</span>
          </div>
          {tiers.map(t => (
            <div key={t.label} className={`grid grid-cols-3 px-2 py-2 border-b border-border-subtle last:border-0 ${t.active ? 'bg-indigo-tint' : ''}`}>
              <span className={`flex items-center gap-1.5 ${t.active ? 'font-bold text-primary' : 'text-on-surface-variant'}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.active ? 'bg-primary' : 'bg-gray-400'}`} />
                ${t.budget}/wk
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

// ── Opportunity card ──────────────────────────────────────────────────────────

const TIER_META = {
  urgent: { label: 'URGENT', border: 'border-l-danger', badgeBg: 'bg-red-tint', badgeText: 'text-danger' },
  high:   { label: 'HIGH',   border: 'border-l-warning', badgeBg: 'bg-orange-tint', badgeText: 'text-warning' },
  normal: { label: 'NORMAL', border: 'border-l-primary', badgeBg: 'bg-indigo-tint', badgeText: 'text-primary' },
}

function OpportunityCard({
  opp,
  rank,
  onLaunch,
  onDismiss,
  busy,
}: {
  opp: Opportunity
  rank: number
  onLaunch: (opp: Opportunity) => void
  onDismiss: (opp: Opportunity) => void
  busy: boolean
}) {
  const sources = (opp.signal_sources ?? []) as Array<Record<string, unknown>>
  const topSignal = sources.find(s => s.growth_pct != null)
  const growthPct = topSignal?.growth_pct as number | undefined

  const estRevenueValue = opp.expected_leads != null ? opp.expected_leads * 80 : null
  const roiMultiplier = opp.expected_leads != null && opp.recommended_budget != null && opp.recommended_budget > 0
    ? Math.round((opp.expected_leads * 80) / (opp.recommended_budget * 4))
    : null

  const isHot = opp.opportunity_score >= 75
  const isMedium = opp.opportunity_score >= 50
  const tier = isHot ? TIER_META.urgent : isMedium ? TIER_META.high : TIER_META.normal
  const confidence = opp.confidence != null ? Math.round(opp.confidence * 100) : null

  return (
    <div className={`bg-surface-card border border-border-subtle border-l-4 ${tier.border} rounded-xl p-5 shadow-soft hover:shadow-soft-md transition-shadow relative`}>
      <button
        onClick={() => onDismiss(opp)}
        title="Dismiss"
        className="absolute top-4 right-4 text-on-surface-variant/50 hover:text-on-surface-variant p-1 rounded-lg hover:bg-surface-container-low transition-colors"
      >
        <X size={14} />
      </button>

      <div className="flex items-center justify-between gap-2 mb-3 pr-6">
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${tier.badgeBg} ${tier.badgeText}`}>
          #{rank} {tier.label}
        </span>
        <span className="inline-flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded-full border border-border-subtle text-[10px] font-bold text-on-surface-variant">
          SCORE {Math.round(opp.opportunity_score)}
        </span>
      </div>

      <p className="text-[10px] font-mono uppercase text-on-surface-variant tracking-wider mb-1">
        {opp.market_name ?? `${opp.industry ?? 'General'} · ${opp.location ?? 'Global'}`}
        {growthPct != null && <span className="text-success ml-1.5">+{Math.round(growthPct)}% demand</span>}
      </p>
      <h3 className="font-bold text-on-surface text-base leading-snug mb-2">{opp.title}</h3>
      {opp.description && (
        <p className="text-sm text-on-surface-variant mb-4 line-clamp-2">{opp.description}</p>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1">Potential Revenue</p>
          <p className="font-mono text-lg font-bold text-on-surface">
            {estRevenueValue != null ? `$${estRevenueValue.toLocaleString()}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1">Confidence</p>
          <p className="font-mono text-lg font-bold text-success">{confidence != null ? `${confidence}%` : '—'}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-on-surface-variant mb-3 pb-3 border-b border-border-subtle">
        <span>Expected Leads <strong className="text-on-surface">{opp.expected_leads ?? '—'}</strong></span>
        <span>ROI Forecast <strong className="text-success">{roiMultiplier != null ? `${roiMultiplier}x` : '—'}</strong></span>
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

export function OpportunityFeedPage() {
  const [statusFilter] = useState<'open'>('open')
  const [scoreFilter, setScoreFilter] = useState<'all' | 'hot' | 'medium' | 'watch'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const { data: opportunities = [], isLoading, refetch } = useOpportunities({ status: statusFilter })
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
  const [livePulse, setLivePulse] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`opportunities-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'opportunities', filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['opportunities'] })
          setLivePulse(true)
          setTimeout(() => setLivePulse(false), 2500)
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

  const filteredOpportunities = useMemo(() => {
    let list = opportunities
    if (scoreFilter === 'hot')    list = list.filter(o => o.opportunity_score >= 75)
    else if (scoreFilter === 'medium') list = list.filter(o => o.opportunity_score >= 50 && o.opportunity_score < 75)
    else if (scoreFilter === 'watch')  list = list.filter(o => o.opportunity_score < 50)
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
  }, [opportunities, scoreFilter, searchQuery])

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

  const hotCount    = opportunities.filter(o => o.opportunity_score >= 75).length
  const totalLeads  = opportunities.reduce((s, o) => s + (o.expected_leads ?? 0), 0)
  const avgConf     = opportunities.length
    ? Math.round(opportunities.reduce((s, o) => s + (o.confidence ?? 0), 0) / opportunities.length * 100)
    : 0
  const totalRevEst = totalLeads * 80

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-6">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-on-surface">Opportunities</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-white px-2 py-0.5 rounded">
              Beta
            </span>
            <span
              title={livePulse ? 'New signal just received' : 'Live — listening for new signals'}
              className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-all ${
                livePulse ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300 animate-pulse' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              <Radio size={10} className={livePulse ? 'animate-pulse' : ''} />
              {livePulse ? 'New signal' : 'Live'}
            </span>
          </div>
          <p className="text-sm text-on-surface-variant">
            Ranked by revenue potential — act on the top of the list first.
          </p>
        </div>

        <div className="flex gap-2 shrink-0 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            <input
              type="text"
              placeholder="Search opportunities…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border border-outline-variant bg-surface-card rounded-xl pl-9 pr-3 py-2 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <button
            onClick={() => refetch()}
            className="border border-outline-variant bg-surface-card hover:bg-surface-container-low rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-1.5 text-on-surface-variant"
          >
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* AI Market Intelligence Briefing */}
      {opportunities.length > 0 && (
        <div className="bg-on-surface rounded-xl p-5 mb-6 text-white">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={15} className="text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-white/70">AI Market Intelligence Briefing</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-black">{opportunities.length}</p>
              <p className="text-xs text-white/50 mt-0.5">Active Opportunities</p>
            </div>
            <div>
              <p className="text-2xl font-black text-danger">{hotCount}</p>
              <p className="text-xs text-white/50 mt-0.5">Hot Markets Now</p>
            </div>
            <div>
              <p className="text-2xl font-black text-success">{totalLeads.toLocaleString()}</p>
              <p className="text-xs text-white/50 mt-0.5">Predicted Total Leads</p>
            </div>
            <div>
              <p className="text-2xl font-black text-warning">
                ${totalRevEst >= 10000 ? `${(totalRevEst / 1000).toFixed(0)}k` : totalRevEst.toLocaleString()}
              </p>
              <p className="text-xs text-white/50 mt-0.5">Est. Revenue at Stake</p>
            </div>
          </div>
          {avgConf > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-3">
              <Brain size={13} className="text-primary shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white/50">Average AI Confidence</span>
                  <span className="text-xs font-bold text-primary">{avgConf}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${avgConf}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Score filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { key: 'all',    label: 'All Opportunities', value: opportunities.length },
          { key: 'hot',    label: '🔥 Hot (≥75)',       value: hotCount },
          { key: 'medium', label: '⚡ Medium (50–74)',   value: opportunities.filter(o => o.opportunity_score >= 50 && o.opportunity_score < 75).length },
          { key: 'watch',  label: 'Watch (<50)',        value: opportunities.filter(o => o.opportunity_score < 50).length },
        ].map(stat => (
          <button
            key={stat.key}
            onClick={() => setScoreFilter(stat.key as typeof scoreFilter)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
              scoreFilter === stat.key
                ? 'bg-primary text-white shadow-soft'
                : 'bg-surface-card border border-outline-variant text-on-surface-variant hover:border-primary/40'
            }`}
          >
            {stat.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${scoreFilter === stat.key ? 'bg-white/20' : 'bg-surface-container-low'}`}>
              {stat.value}
            </span>
          </button>
        ))}
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOpportunities.map((opp, i) => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              rank={i + 1}
              onLaunch={handleLaunch}
              onDismiss={handleDismiss}
              busy={loadingOppId === opp.id}
            />
          ))}
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
