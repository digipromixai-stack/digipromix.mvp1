import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Building2, ExternalLink, MoreVertical, Pencil, Trash2, ShieldAlert, Gauge, Radar, ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useCompetitors, useDeleteCompetitor } from '../hooks/useCompetitors'
import { CompetitorForm } from '../components/competitors/CompetitorForm'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { formatUrl } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Competitor } from '../types/database.types'

function getInitial(name = '') { return (name[0] ?? '?').toUpperCase() }

const TYPE_LABELS: Record<string, string> = {
  promotion: 'Promotion', price_change: 'Price Change', campaign_launch: 'Campaign Launch',
  new_landing_page: 'New Page', banner_change: 'Banner', content_change: 'Content', new_blog_post: 'Blog Post',
}

interface IntelStats {
  total7d: number
  high7d: number
  types: string[]
  lastAt: string | null
  lastTitle: string | null
  lastDescription: string | null
}

const EMPTY_INTEL: IntelStats = { total7d: 0, high7d: 0, types: [], lastAt: null, lastTitle: null, lastDescription: null }

function computeAggression(intel: IntelStats) {
  return Math.min(100, intel.high7d * 20 + intel.total7d * 7)
}
function threatTone(aggression: number) {
  if (aggression >= 70) return { label: 'High risk', pill: 'bg-red-tint text-danger' }
  if (aggression >= 35) return { label: 'Medium risk', pill: 'bg-orange-tint text-warning' }
  return { label: 'Low risk', pill: 'bg-primary-container text-on-primary-container' }
}
function churnRisk(aggression: number, high7d: number) {
  const prob = Math.min(97, Math.round(aggression * 0.9 + high7d * 4))
  const label = prob >= 70 ? 'HIGH' : prob >= 35 ? 'MEDIUM' : 'LOW'
  return { prob, label }
}
function whyText(name: string, intel: IntelStats) {
  if (intel.total7d === 0) {
    return `${name} has been quiet — no notable pricing, promotion, or campaign activity detected in the last 7 days.`
  }
  const typeText = intel.types.slice(0, 2).map(t => TYPE_LABELS[t] ?? t).join(' and ').toLowerCase()
  return `${name}'s recent ${typeText} activity has driven ${intel.total7d} detected signal${intel.total7d > 1 ? 's' : ''} this week${
    intel.high7d > 0 ? `, including ${intel.high7d} high-threat change${intel.high7d > 1 ? 's' : ''}` : ''
  }. Recommend reviewing your competitive positioning in this segment.`
}
function timeAgo(iso: string | null) {
  if (!iso) return 'No recent activity'
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Competitor card ───────────────────────────────────────────────────────────

function CompetitorCard({ competitor, intel }: { competitor: Competitor; intel: IntelStats }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const deleteMutation = useDeleteCompetitor()

  const aggression = computeAggression(intel)
  const tone = threatTone(aggression)
  const churn = churnRisk(aggression, intel.high7d)
  const isHigh = aggression >= 70

  return (
    <>
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-[18px] shadow-soft">
        <div className="flex items-center gap-3 mb-3.5">
          <div className="w-[38px] h-[38px] rounded-[10px] bg-ink text-white flex items-center justify-center font-display font-semibold text-sm shrink-0">
            {getInitial(competitor.name)}
          </div>
          <div className="min-w-0 flex-1">
            <Link to={`/competitors/${competitor.id}`} className="font-semibold text-[14.5px] text-on-surface hover:text-primary truncate block">
              {competitor.name}
            </Link>
            <div className="flex items-center gap-1.5 flex-wrap">
              <a href={competitor.website_url} target="_blank" rel="noreferrer" className="text-[11.5px] text-on-surface-variant hover:text-primary flex items-center gap-0.5 truncate">
                {competitor.industry ?? formatUrl(competitor.website_url)}
                <ExternalLink size={9} />
              </a>
              {competitor.industry && <Badge variant="info" size="xs">{competitor.industry}</Badge>}
            </div>
          </div>
          <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${tone.pill}`}>{tone.label}</span>
          <div className="relative shrink-0">
            <button onClick={() => setMenuOpen(o => !o)} className="p-1.5 rounded-md text-on-surface-variant hover:bg-surface-container-low">
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-surface-card rounded-lg border border-border-subtle shadow-soft-lg z-10">
                <button onClick={() => { setEditOpen(true); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-on-surface hover:bg-surface-container-low">
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => { if (confirm(`Remove ${competitor.name}?`)) deleteMutation.mutate(competitor.id); setMenuOpen(false) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-danger hover:bg-red-tint"
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <p className="text-[10.5px] text-on-surface-variant mb-1">Aggression Score</p>
            <p className="font-mono text-[14.5px] font-semibold text-on-surface">{aggression.toFixed(0)} / 100</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10.5px] text-on-surface-variant mb-1">Active Promotion</p>
            <p className="font-mono text-[14.5px] font-semibold text-on-surface truncate">{intel.lastTitle ?? 'None detected'}</p>
          </div>
          <div>
            <p className="text-[10.5px] text-on-surface-variant mb-1">Signals (7d)</p>
            <p className="font-mono text-[14.5px] font-semibold text-on-surface">{intel.total7d}</p>
          </div>
        </div>

        {intel.total7d > 0 && (
          <div className={`rounded-lg p-2.5 flex gap-2 text-[12.3px] mb-3 ${isHigh ? 'bg-red-tint text-[#7A2A1D]' : 'bg-orange-tint text-[#7A5416]'}`}>
            <span className="shrink-0">{isHigh ? '⚠️' : 'ℹ️'}</span>
            <span>
              <strong>Probability of losing customers: {churn.label} ({churn.prob}%).</strong>{' '}
              {intel.lastDescription ?? whyText(competitor.name, intel)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-on-surface-variant flex-1">{timeAgo(intel.lastAt)}</span>
          <Link
            to={isHigh ? '/interception' : `/competitors/${competitor.id}`}
            className={`inline-flex items-center gap-1.5 text-white text-[13px] font-semibold py-2 px-4 rounded-lg hover:opacity-90 transition-opacity ${isHigh ? 'bg-danger' : 'bg-primary'}`}
          >
            {isHigh ? 'Launch Counter Campaign' : 'View Intelligence'}
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
      <CompetitorForm open={editOpen} onClose={() => setEditOpen(false)} competitor={competitor} />
    </>
  )
}

// ── Signal Activity Index widget ─────────────────────────────────────────────

function SignalActivityIndex({ competitors, intelMap }: { competitors: Competitor[]; intelMap: Record<string, IntelStats> }) {
  const ranked = [...competitors]
    .map(c => ({ c, intel: intelMap[c.id] ?? EMPTY_INTEL }))
    .sort((a, b) => b.intel.total7d - a.intel.total7d)
    .slice(0, 3)
  const max = Math.max(1, ...ranked.map(r => r.intel.total7d))

  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-soft">
      <div className="flex items-center gap-2 mb-4">
        <Gauge size={16} className="text-on-surface-variant" />
        <h3 className="font-display text-[14.5px] font-semibold text-on-surface">Signal Activity Index</h3>
      </div>
      {ranked.every(r => r.intel.total7d === 0) ? (
        <p className="text-xs text-on-surface-variant">No competitor activity detected in the last 7 days.</p>
      ) : (
        <div className="space-y-3">
          {ranked.map(({ c, intel }) => {
            const aggression = computeAggression(intel)
            const barColor = aggression >= 70 ? 'bg-danger' : aggression >= 35 ? 'bg-warning' : 'bg-primary'
            const pct = Math.max(4, (intel.total7d / max) * 100)
            return (
              <div key={c.id}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-semibold text-on-surface truncate">{c.name}</span>
                  <span className="text-xs font-mono font-bold text-on-surface-variant">{intel.total7d} signals/wk</span>
                </div>
                <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-[10.5px] text-on-surface-variant mt-4">Aggregated from detected page changes across tracked competitors.</p>
    </div>
  )
}

// ── AI Reconnaissance widget ─────────────────────────────────────────────────

function AiReconnaissance({ competitors }: { competitors: Competitor[] }) {
  const newest = [...competitors].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const isRecent = newest && Date.now() - new Date(newest.created_at).getTime() < 7 * 86400000

  return (
    <div className="bg-gradient-to-br from-ink to-ink-2 rounded-2xl p-5 text-white flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Radar size={16} className="text-white/80" />
          <h3 className="font-display text-[14.5px] font-semibold">AI Reconnaissance</h3>
        </div>
        <p className="text-sm text-white/80 leading-relaxed">
          {isRecent
            ? `A new competitor, "${newest.name}", was added to tracking this week. Monitoring has started across their key pages.`
            : competitors.length > 0
              ? 'No new market entrants detected. Monitoring continues across your tracked competitor set.'
              : 'Add competitors to begin AI-driven reconnaissance of your market.'}
        </p>
      </div>
      {newest && (
        <Link
          to={`/competitors/${newest.id}`}
          className="inline-flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-4 py-2 rounded-lg mt-4 w-fit transition-colors"
        >
          View Profile
        </Link>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function CompetitorsPage() {
  const { businessId } = useAuth()
  const [addOpen, setAddOpen] = useState(false)
  const { data: competitors = [], isLoading } = useCompetitors()

  const { data: recentChanges = [] } = useQuery({
    queryKey: ['competitors_intel', businessId],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data } = await supabase
        .from('detected_changes')
        .select('competitor_id, severity, change_type, detected_at, title, description')
        .eq('user_id', businessId!)
        .gte('detected_at', weekAgo)
        .order('detected_at', { ascending: false })
      return data ?? []
    },
    enabled: !!businessId,
    refetchInterval: 60000,
  })

  const intelMap = useMemo(() => {
    const map: Record<string, IntelStats> = {}
    for (const c of recentChanges) {
      if (!map[c.competitor_id]) map[c.competitor_id] = { ...EMPTY_INTEL, types: [] }
      const s = map[c.competitor_id]
      s.total7d++
      if (c.severity === 'high') s.high7d++
      if (!s.types.includes(c.change_type)) s.types.push(c.change_type)
      if (!s.lastAt || c.detected_at > s.lastAt) {
        s.lastAt = c.detected_at
        s.lastTitle = c.title
        s.lastDescription = c.description
      }
    }
    return map
  }, [recentChanges])

  const sortedCompetitors = useMemo(() => {
    return [...competitors].sort((a, b) => {
      const ia = intelMap[a.id] ?? EMPTY_INTEL
      const ib = intelMap[b.id] ?? EMPTY_INTEL
      return computeAggression(ib) - computeAggression(ia)
    })
  }, [competitors, intelMap])

  const totalSignals7d = recentChanges.length
  const highThreats = recentChanges.filter(c => c.severity === 'high').length
  const volatility = highThreats >= 3 ? 'High' : (highThreats >= 1 || totalSignals7d >= 5) ? 'Moderate' : 'Low'
  const volatilityClass = volatility === 'High' ? 'text-danger' : volatility === 'Moderate' ? 'text-warning' : 'text-primary'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl text-on-surface tracking-tight">Competitor Intelligence</h1>
          <p className="text-on-surface-variant text-sm mt-1 max-w-xl">
            Real-time tracking of aggressive movements in your market sectors. AI-driven threat assessment and recommended counter-actions.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex items-center gap-2 bg-surface-card border border-border-subtle rounded-full px-3.5 py-2 shadow-soft">
            <Gauge size={13} className={volatilityClass} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Market Volatility</span>
            <span className={`text-xs font-bold ${volatilityClass}`}>{volatility}</span>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 bg-primary text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:opacity-90 shrink-0"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : competitors.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No competitors yet"
          description="Add your first competitor to start monitoring their website for pricing changes, promotions, and feature updates."
          action={
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 bg-primary text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:opacity-90">
              <Plus size={16} /> Add Competitor
            </button>
          }
        />
      ) : (
        <>
          {/* Competitor list */}
          <div className="flex flex-col gap-3.5">
            {sortedCompetitors.map(c => (
              <CompetitorCard key={c.id} competitor={c} intel={intelMap[c.id] ?? EMPTY_INTEL} />
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <SignalActivityIndex competitors={competitors} intelMap={intelMap} />
            <AiReconnaissance competitors={competitors} />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <ShieldAlert size={13} />
            {competitors.length} tracked · <span className="text-primary font-medium">{competitors.filter(c => c.is_active).length} active monitoring</span>
          </div>
        </>
      )}

      <CompetitorForm open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
