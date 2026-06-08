/**
 * MVP 2.0 — Revenue Opportunity Feed (Opportunity Radar)
 *
 * Reads from `opportunities` (filled hourly by score-opportunities cron).
 * Clicking "Launch Campaign" opens the same CampaignModal used by the
 * Changes page — it pulls the source detected_change via metadata.source_change_id
 * and pre-fills generate-campaign with the right context.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, TrendingUp, Target, DollarSign, Zap,
  ArrowRight, Filter, Search, RefreshCcw, X, Loader2, Radio,
  BarChart2, ChevronDown, ChevronUp,
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

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  let bg = 'bg-gray-100 text-gray-700'
  let label = 'Low'
  if (score >= 75) { bg = 'bg-green-100 text-green-700';  label = '🔥 High' }
  else if (score >= 50) { bg = 'bg-amber-100 text-amber-700'; label = '⚡ Medium' }
  else if (score >= 25) { bg = 'bg-blue-100 text-blue-700';   label = 'Watch' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${bg}`}>
      {label} · {Math.round(score)}
    </span>
  )
}

// ── Opportunity card ──────────────────────────────────────────────────────────

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

  // Derive growth % from signal_sources for display
  const sources = (opp.signal_sources ?? []) as Array<Record<string, unknown>>
  const topSignal = sources.find(s => s.growth_pct != null)
  const growthPct = topSignal?.growth_pct as number | undefined

  return (
    <div className={`bg-white border ${isNew ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-gray-200'} rounded-2xl p-5 hover:shadow-md transition-shadow relative`}>
      {isNew && (
        <span className="absolute -top-2 -left-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-sm">
          New
        </span>
      )}
      <button
        onClick={() => onDismiss(opp)}
        title="Dismiss this opportunity"
        className="absolute top-3 right-3 text-gray-300 hover:text-gray-500 p-1 rounded"
      >
        <X size={14} />
      </button>

      {/* Market + score */}
      <div className="flex items-start justify-between gap-3 mb-2 pr-6">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <p className="text-xs font-mono uppercase text-gray-400 tracking-wider">
              {opp.market_name ?? `${opp.industry ?? 'General'} · ${opp.location ?? 'Global'}`}
            </p>
            {growthPct != null && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
                <TrendingUp size={9} />+{Math.round(growthPct)}%
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-base leading-snug">{opp.title}</h3>
        </div>
        {/* Urgency ring on hot opportunities */}
        <div className={opp.opportunity_score >= 75 ? 'ring-2 ring-orange-300 animate-pulse rounded-full p-0.5' : ''}>
          <ScoreBadge score={opp.opportunity_score} />
        </div>
      </div>

      {/* Signal source chips */}
      <SignalSourceBadge opp={opp} />

      {opp.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{opp.description}</p>
      )}

      {/* Compact stats strip */}
      <div className="flex items-center gap-x-4 gap-y-1 text-sm mb-3 flex-wrap">
        {opp.expected_leads != null && (
          <span className="text-gray-500">
            <span className="font-bold text-gray-900">{opp.expected_leads}</span> est. customers
          </span>
        )}
        {opp.estimated_cpc != null && (
          <span className="text-gray-500">
            <span className="font-bold text-gray-900">${opp.estimated_cpc.toFixed(2)}</span>/lead
          </span>
        )}
        {opp.confidence != null && (
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="font-bold text-gray-900">{Math.round(opp.confidence * 100)}%</span>
            AI confidence
            <div className="w-10 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.round(opp.confidence * 100)}%` }} />
            </div>
          </span>
        )}
      </div>

      {/* Budget scenarios */}
      <BudgetTiers opp={opp} />

      {opp.recommended_action && (
        <p className="text-sm text-violet-700 mb-3 flex items-start gap-1.5">
          <Sparkles size={14} className="shrink-0 mt-0.5 text-violet-500" />
          <span>{opp.recommended_action}</span>
        </p>
      )}

      {/* Dynamic launch button based on score */}
      <button
        onClick={() => onLaunch(opp)}
        disabled={busy}
        className={`w-full disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
          opp.opportunity_score >= 75
            ? 'bg-green-600 hover:bg-green-700'
            : opp.opportunity_score >= 50
            ? 'bg-indigo-600 hover:bg-indigo-700'
            : 'bg-gray-900 hover:bg-gray-800'
        }`}
      >
        {busy ? (
          <><Loader2 size={14} className="animate-spin" /> Loading…</>
        ) : opp.opportunity_score >= 75 ? (
          <>🔥 Launch Now — Hot Market <ArrowRight size={14} /></>
        ) : opp.opportunity_score >= 50 ? (
          <>⚡ Launch Campaign <ArrowRight size={14} /></>
        ) : (
          <>Launch Campaign <ArrowRight size={14} /></>
        )}
      </button>
    </div>
  )
}

export function OpportunityFeedPage() {
  const [statusFilter] = useState<'open'>('open')
  const [scoreFilter, setScoreFilter] = useState<'all' | 'hot' | 'medium' | 'watch'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Target size={20} className="text-blue-500" />
            <h1 className="text-2xl font-bold text-gray-900">Opportunity Radar</h1>
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
            AI-scored revenue opportunities based on competitor signals, search trends, and your campaign history.
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
              showFilters || scoreFilter !== 'all'
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

      {/* Score filter chips */}
      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-xs text-gray-500 font-medium">Score:</span>
          {([
            { value: 'all',    label: 'All' },
            { value: 'hot',    label: '🔥 Hot (≥75)' },
            { value: 'medium', label: '⚡ Medium (50–74)' },
            { value: 'watch',  label: 'Watch (<50)' },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setScoreFilter(value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                scoreFilter === value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Quick stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Revenue Opportunities', value: opportunities.length, icon: Target, color: 'blue' },
          { label: 'Hot Market (≥75)', value: opportunities.filter(o => o.opportunity_score >= 75).length, icon: TrendingUp, color: 'red' },
          { label: 'Avg AI Confidence', value: opportunities.length ? Math.round(opportunities.reduce((s, o) => s + (o.confidence ?? 0), 0) / opportunities.length * 100) + '%' : '—', icon: Sparkles, color: 'violet' },
          { label: 'Potential Customers', value: opportunities.reduce((s, o) => s + (o.expected_leads ?? 0), 0), icon: DollarSign, color: 'green' },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-1">
                <Icon size={14} className={`text-${stat.color}-500`} /> {stat.label}
              </div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
            </div>
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
