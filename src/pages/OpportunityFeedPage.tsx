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
  BarChart2, ChevronDown, ChevronUp, Brain, Clock, ShieldAlert,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useOpportunities } from '../hooks/useOpportunities'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
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

  // Build small signal chips — one per distinct source type
  const chips: { label: string; icon: React.ElementType; cls: string }[] = []

  if (isStandalone && hasSearchSpike) {
    chips.push({ label: 'Google Trends', icon: TrendingUp, cls: 'bg-green-50 text-green-700 border-green-200' })
  }
  if (isStandalone && hasAdSpike) {
    chips.push({ label: 'Meta Ad Spike', icon: BarChart2, cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' })
  }
  if (!isStandalone && meta?.source_competitor) {
    chips.push({ label: `${meta.source_competitor} change`, icon: Target, cls: 'bg-orange-50 text-orange-700 border-orange-200' })
  }
  if (hasAdSpike && !isStandalone) {
    chips.push({ label: 'Ad spike corroborates', icon: TrendingUp, cls: 'bg-green-50 text-green-700 border-green-200' })
  }
  if (hasNewCreative) chips.push({ label: 'New creative', icon: Sparkles, cls: 'bg-violet-50 text-violet-700 border-violet-200' })
  if (hasOfferRepeat) chips.push({ label: 'Offer repeating', icon: Zap, cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' })

  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mb-3">
      {chips.map(({ label, icon: Icon, cls }) => (
        <span key={label} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
          <Icon size={9} />
          {label}
        </span>
      ))}
    </div>
  )
}

// ── Budget tier simulator ─────────────────────────────────────────────────────
// Shows three budget scenarios (conservative / recommended / aggressive) so
// users see the MVP 2 doc's "€15/day → weak, €40/day → optimal, €100/day →
// diminishing returns" without leaving the feed.

function BudgetTiers({ opp }: { opp: Opportunity }) {
  const [open, setOpen] = useState(false)
  const recBudget = opp.recommended_budget
  const expLeads  = opp.expected_leads
  const cpc       = opp.estimated_cpc

  if (!recBudget || !cpc || cpc <= 0) return null

  // Three tiers — lead count scales with budget but with diminishing returns above optimal
  const tiers = [
    {
      label: 'Conservative',
      budget: Math.round(recBudget * 0.4),
      cls: 'text-gray-600',
      dot: 'bg-gray-400',
      tag: 'Weak impact',
    },
    {
      label: 'Recommended',
      budget: recBudget,
      cls: 'text-blue-700 font-bold',
      dot: 'bg-blue-500',
      tag: 'Optimal',
    },
    {
      label: 'Aggressive',
      budget: Math.round(recBudget * 2.5),
      cls: 'text-gray-600',
      dot: 'bg-gray-400',
      tag: 'Diminishing returns',
    },
  ]

  const leadsFor = (budget: number) => {
    if (!expLeads) return '—'
    const ratio = budget / recBudget
    // diminishing returns above 2×: sqrt scaling above optimal
    const scale = ratio <= 1 ? ratio : 1 + Math.sqrt(ratio - 1) * 0.7
    return Math.max(1, Math.round(expLeads * scale))
  }

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
      >
        <DollarSign size={11} />
        Budget scenarios
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-gray-100 overflow-hidden text-xs">
          <div className="grid grid-cols-3 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400 px-2 py-1.5 border-b border-gray-100">
            <span>Budget/wk</span><span className="text-center">Est. leads</span><span className="text-right">Impact</span>
          </div>
          {tiers.map(t => (
            <div key={t.label} className={`grid grid-cols-3 px-2 py-2 border-b border-gray-50 last:border-0 ${t.label === 'Recommended' ? 'bg-blue-50/40' : ''}`}>
              <span className={`flex items-center gap-1.5 ${t.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${t.dot} shrink-0`} />
                ${t.budget}/wk
              </span>
              <span className={`text-center ${t.cls}`}>{leadsFor(t.budget)}</span>
              <span className={`text-right text-[10px] ${t.cls}`}>{t.tag}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Opportunity card ──────────────────────────────────────────────────────────

function UrgencyBar({ score }: { score: number }) {
  const level = score >= 75 ? 'URGENT' : score >= 50 ? 'MEDIUM' : 'LOW'
  const pct = Math.min(100, score)
  const color = score >= 75 ? 'bg-red-500' : score >= 50 ? 'bg-amber-500' : 'bg-blue-400'
  const textColor = score >= 75 ? 'text-red-700' : score >= 50 ? 'text-amber-700' : 'text-blue-700'
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[9px] font-black uppercase tracking-widest ${textColor} shrink-0`}>{level}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-bold text-gray-400">{Math.round(score)}</span>
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
  const ageMs = Date.now() - new Date(opp.created_at).getTime()
  const isNew = ageMs < 5 * 60 * 1000

  const sources = (opp.signal_sources ?? []) as Array<Record<string, unknown>>
  const topSignal = sources.find(s => s.growth_pct != null)
  const growthPct = topSignal?.growth_pct as number | undefined

  // Revenue impact estimate: leads × avg lead value ($80)
  const estRevenueValue = opp.expected_leads != null ? opp.expected_leads * 80 : null
  const roiMultiplier = opp.expected_leads != null && opp.recommended_budget != null && opp.recommended_budget > 0
    ? Math.round((opp.expected_leads * 80) / (opp.recommended_budget * 4))
    : null

  const isHot = opp.opportunity_score >= 75
  const isMedium = opp.opportunity_score >= 50

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden hover:shadow-lg transition-shadow relative
      ${isHot ? 'border-orange-200 ring-1 ring-orange-100' : isNew ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-gray-200'}`}>

      {/* Hot market gradient header */}
      {isHot && (
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-1">
            🔥 HOT MARKET — ACT NOW
          </span>
        </div>
      )}
      {isNew && !isHot && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-white">⚡ NEW SIGNAL</span>
        </div>
      )}

      <div className="p-5">
        <button
          onClick={() => onDismiss(opp)}
          title="Dismiss"
          className="absolute top-3 right-3 text-gray-300 hover:text-gray-500 p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X size={14} />
        </button>

        {/* Market identifier */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1 pr-6">
          <p className="text-[10px] font-mono uppercase text-gray-400 tracking-wider">
            {opp.market_name ?? `${opp.industry ?? 'General'} · ${opp.location ?? 'Global'}`}
          </p>
          {growthPct != null && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
              <TrendingUp size={9} />+{Math.round(growthPct)}% demand
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-bold text-gray-900 text-base leading-snug mb-2">{opp.title}</h3>

        {/* Signal chips */}
        <SignalSourceBadge opp={opp} />

        {/* Description / WHY NOW */}
        {opp.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">{opp.description}</p>
        )}

        {/* ── Revenue Impact Block ── */}
        {(estRevenueValue != null || roiMultiplier != null || opp.recommended_budget != null) && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-3 mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-green-700 mb-2 flex items-center gap-1">
              <DollarSign size={10} /> Revenue Impact
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {opp.expected_leads != null && (
                <div>
                  <p className="text-lg font-black text-gray-900">{opp.expected_leads}</p>
                  <p className="text-[10px] text-gray-500 uppercase">Pred. Leads</p>
                </div>
              )}
              {estRevenueValue != null && (
                <div>
                  <p className="text-lg font-black text-green-700">
                    ${estRevenueValue >= 1000 ? `${(estRevenueValue / 1000).toFixed(1)}k` : estRevenueValue}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase">Est. Value</p>
                </div>
              )}
              {roiMultiplier != null && (
                <div>
                  <p className="text-lg font-black text-indigo-700">{roiMultiplier}×</p>
                  <p className="text-[10px] text-gray-500 uppercase">ROI Est.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Urgency + Confidence row */}
        <div className="space-y-1.5 mb-3">
          <UrgencyBar score={opp.opportunity_score} />
          {opp.confidence != null && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-violet-600 shrink-0 flex items-center gap-1">
                <Brain size={9} /> AI CONF.
              </span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.round(opp.confidence * 100)}%` }} />
              </div>
              <span className="text-[9px] font-bold text-violet-600">{Math.round(opp.confidence * 100)}%</span>
            </div>
          )}
        </div>

        {/* Timing indicator */}
        {opp.expires_at && (
          <div className={`flex items-center gap-1.5 mb-3 text-xs font-semibold px-2.5 py-1.5 rounded-lg
            ${new Date(opp.expires_at) < new Date(Date.now() + 24 * 3600000)
              ? 'text-red-700 bg-red-50 border border-red-200'
              : 'text-amber-700 bg-amber-50 border border-amber-200'}`}>
            <Clock size={11} />
            {new Date(opp.expires_at) < new Date(Date.now() + 24 * 3600000)
              ? 'Expires in less than 24h — act now'
              : `Window closes in ${Math.round((new Date(opp.expires_at).getTime() - Date.now()) / 86400000)}d`}
          </div>
        )}

        {/* CPC / CPL details */}
        {(opp.estimated_cpc != null || opp.estimated_cpl != null || opp.recommended_budget != null) && (
          <div className="flex items-center gap-3 text-xs text-gray-500 mb-3 flex-wrap">
            {opp.recommended_budget != null && (
              <span><span className="font-bold text-gray-800">${opp.recommended_budget}</span>/wk budget</span>
            )}
            {opp.estimated_cpc != null && (
              <span><span className="font-bold text-gray-800">${opp.estimated_cpc.toFixed(2)}</span>/click</span>
            )}
            {opp.estimated_cpl != null && (
              <span><span className="font-bold text-gray-800">${opp.estimated_cpl.toFixed(0)}</span>/lead</span>
            )}
          </div>
        )}

        {/* Budget scenarios */}
        <BudgetTiers opp={opp} />

        {/* AI recommended action */}
        {opp.recommended_action && (
          <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 mb-3">
            <p className="text-sm text-violet-800 flex items-start gap-1.5">
              <Sparkles size={13} className="shrink-0 mt-0.5 text-violet-500" />
              <span className="font-medium">{opp.recommended_action}</span>
            </p>
          </div>
        )}

        {/* Launch button */}
        <button
          onClick={() => onLaunch(opp)}
          disabled={busy}
          className={`w-full disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm ${
            isHot
              ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600'
              : isMedium
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700'
              : 'bg-gray-900 hover:bg-gray-800'
          }`}
        >
          {busy ? (
            <><Loader2 size={14} className="animate-spin" /> Loading…</>
          ) : isHot ? (
            <>🔥 Launch Now — Hot Market <ArrowRight size={14} /></>
          ) : isMedium ? (
            <>⚡ Launch AI Campaign <ArrowRight size={14} /></>
          ) : (
            <>Launch Campaign <ArrowRight size={14} /></>
          )}
        </button>
      </div>
    </div>
  )
}

export function OpportunityFeedPage() {
  const [statusFilter] = useState<'open'>('open')
  const [scoreFilter, setScoreFilter] = useState<'all' | 'hot' | 'medium' | 'watch'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [_showFilters, setShowFilters] = useState(false)
  const { data: opportunities = [], isLoading, refetch } = useOpportunities({ status: statusFilter })
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // Active campaign-launch context: the opportunity we're acting on + the
  // detected_change row we resolved from metadata.source_change_id
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

  // MVP 2.0 §Phase 3 — Realtime Opportunity Feed.
  // Supabase realtime subscription on `opportunities`: new opps pop in
  // without refresh. We invalidate the React Query cache on any change.
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

  // Fetch the source detected_change and open the campaign modal.
  // For standalone signal-based opportunities, score-opportunities stores the
  // most-recent competitor change as a best-effort source_change_id so we can
  // still open the campaign modal with real context.
  async function handleLaunch(opp: Opportunity) {
    const meta     = (opp.metadata as Record<string, unknown> | null) ?? {}
    const sourceId = meta.source_change_id as string | undefined

    if (!sourceId) {
      // Pure signal opportunity with no competitor change at all — redirect the
      // user to the Timeline so they can pick the most relevant signal.
      alert(
        'This opportunity is based on a market demand signal (e.g. Google Trends spike). '
        + 'To launch a campaign, go to the Timeline, find a competitor move to counter, '
        + 'and click "Launch Counter Campaign".',
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
        alert('Could not load the source signal for this opportunity. It may have been pruned.')
        return
      }
      setActiveChange(data as DetectedChangeWithCompetitor)
      // Carry the Opportunity Radar projections into the campaign modal
      // so it pre-fills the budget / lead expectations panel.
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

  // Client-side filtering by score tier + search query
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

  // Dismiss → flip status to 'dismissed' so it falls out of the open feed
  async function handleDismiss(opp: Opportunity) {
    await supabase
      .from('opportunities')
      .update({ status: 'dismissed' })
      .eq('id', opp.id)
    queryClient.invalidateQueries({ queryKey: ['opportunities'] })
  }

  // Market Intelligence Briefing computations
  const hotCount    = opportunities.filter(o => o.opportunity_score >= 75).length
  const totalLeads  = opportunities.reduce((s, o) => s + (o.expected_leads ?? 0), 0)
  const avgConf     = opportunities.length
    ? Math.round(opportunities.reduce((s, o) => s + (o.confidence ?? 0), 0) / opportunities.length * 100)
    : 0
  const totalRevEst = totalLeads * 80

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Brain size={18} className="text-violet-600" />
            <h1 className="text-2xl font-bold text-gray-900">AI Revenue Intelligence</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-2 py-0.5 rounded">
              Beta
            </span>
            <span
              title={livePulse ? 'New signal just received' : 'Live — listening for new signals'}
              className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-all ${
                livePulse
                  ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300 animate-pulse'
                  : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              <Radio size={10} className={livePulse ? 'animate-pulse' : ''} />
              {livePulse ? 'New signal' : 'Live'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            AI-detected revenue opportunities ranked by urgency, confidence, and predicted business impact.
          </p>
        </div>

        <div className="flex gap-2 shrink-0 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search opportunities…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm w-48 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`border rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
              scoreFilter !== 'all'
                ? 'border-blue-400 text-blue-700 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Filter size={14} /> Filters
            {scoreFilter !== 'all' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-0.5" />}
          </button>
          <button onClick={() => refetch()} className="border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5">
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Market Intelligence Briefing banner */}
      {opportunities.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-5 mb-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={15} className="text-violet-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-violet-300">AI Market Intelligence Briefing</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-black">{opportunities.length}</p>
              <p className="text-xs text-slate-400 mt-0.5">Active Opportunities</p>
            </div>
            <div>
              <p className="text-2xl font-black text-red-400">{hotCount}</p>
              <p className="text-xs text-slate-400 mt-0.5">🔥 Hot Markets Now</p>
            </div>
            <div>
              <p className="text-2xl font-black text-green-400">{totalLeads.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-0.5">Predicted Total Leads</p>
            </div>
            <div>
              <p className="text-2xl font-black text-yellow-400">
                ${totalRevEst >= 10000 ? `${(totalRevEst / 1000).toFixed(0)}k` : totalRevEst.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Est. Revenue at Stake</p>
            </div>
          </div>
          {avgConf > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-3">
              <Brain size={13} className="text-violet-400 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">Average AI Confidence</span>
                  <span className="text-xs font-bold text-violet-300">{avgConf}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-400 rounded-full" style={{ width: `${avgConf}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Score filter / stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'All Opportunities',    value: opportunities.length,  icon: Target,    active: scoreFilter === 'all',    onClick: () => setScoreFilter('all') },
          { label: '🔥 Hot (≥75)',          value: hotCount,              icon: TrendingUp, active: scoreFilter === 'hot',    onClick: () => setScoreFilter('hot') },
          { label: '⚡ Medium (50–74)',    value: opportunities.filter(o => o.opportunity_score >= 50 && o.opportunity_score < 75).length, icon: Sparkles, active: scoreFilter === 'medium', onClick: () => setScoreFilter('medium') },
          { label: 'Watch (<50)',          value: opportunities.filter(o => o.opportunity_score < 50).length, icon: DollarSign, active: scoreFilter === 'watch', onClick: () => setScoreFilter('watch') },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <button
              key={stat.label}
              onClick={stat.onClick}
              className={`bg-white border rounded-xl p-4 text-left transition-all hover:shadow-sm ${
                stat.active ? 'border-violet-400 ring-1 ring-violet-100 shadow-sm' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-1.5 text-gray-500 text-xs uppercase tracking-wider mb-1.5">
                <Icon size={12} className={stat.active ? 'text-violet-500' : 'text-gray-400'} />
                {stat.label}
              </div>
              <div className={`text-2xl font-bold ${stat.active ? 'text-violet-700' : 'text-gray-900'}`}>{stat.value}</div>
            </button>
          )
        })}
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">
          <Search className="mx-auto mb-3 animate-pulse" size={32} />
          Scanning signals…
        </div>
      ) : filteredOpportunities.length === 0 && opportunities.length > 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Filter size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-medium">No opportunities match your filters.</p>
          <button onClick={() => { setScoreFilter('all'); setSearchQuery('') }} className="mt-2 text-xs text-blue-600 hover:underline">Clear filters</button>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="bg-gradient-to-br from-blue-50 via-violet-50 to-pink-50 border border-blue-100 rounded-2xl p-12 text-center">
          <Zap size={48} className="mx-auto mb-4 text-blue-500" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Your first opportunity is coming soon</h2>
          <p className="text-sm text-gray-600 mb-5 max-w-md mx-auto">
            DigiPromix is scanning competitor activity, search trends, and ad spend signals. As real signals
            start flowing, scored opportunities will appear here in real-time.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center max-w-md mx-auto">
            <Link to="/competitors" className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg">
              Add a competitor
            </Link>
            <Link to="/settings" className="border border-gray-300 hover:bg-white text-gray-700 text-sm font-semibold py-2 px-4 rounded-lg">
              Connect ad accounts
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOpportunities.map(opp => (
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

      {/* Campaign generation modal — same one Changes page uses, now
          pre-filled with the Opportunity Radar projections. */}
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
        <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 backdrop-blur border-t border-gray-100 lg:hidden z-30">
          <button
            onClick={() => opportunities[0] && handleLaunch(opportunities[0])}
            disabled={!!loadingOppId}
            className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg"
          >
            {loadingOppId ? <><Loader2 size={16} className="animate-spin" />Loading…</> : <>⚡ Launch Top Opportunity <ArrowRight size={16} /></>}
          </button>
        </div>
      )}
    </div>
  )
}
