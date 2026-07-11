import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Building2, ExternalLink, MoreVertical, Pencil, Trash2, ShieldAlert, ArrowRight, Maximize2, Radar, Gauge } from 'lucide-react'
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

const AVATAR_COLORS = [
  '#3b6fb5','#9a4f96','#c2683a','#2f8f7d',
  '#5b6477','#c43d3d','#2563eb','#1f9d5b',
]
function avatarColor(name = '') {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 65) % AVATAR_COLORS.length]
}
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
  if (aggression >= 70) return { label: 'HIGH THREAT', color: '#e5484d', bg: '#fdeceb' }
  if (aggression >= 35) return { label: 'MEDIUM THREAT', color: '#d9920a', bg: '#fdf3e3' }
  return { label: 'LOW THREAT', color: '#1f9d5b', bg: '#e9f7ef' }
}
function churnRisk(aggression: number, high7d: number) {
  const prob = Math.min(97, Math.round(aggression * 0.9 + high7d * 4))
  const label = prob >= 70 ? 'Critical' : prob >= 35 ? 'Moderate' : 'Low'
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

// ── Large hero threat card ───────────────────────────────────────────────────

function ThreatHeroCard({ competitor, intel }: { competitor: Competitor; intel: IntelStats }) {
  const aggression = computeAggression(intel)
  const tone = threatTone(aggression)
  const churn = churnRisk(aggression, intel.high7d)
  const isHigh = aggression >= 70

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div className="h-1" style={{ background: tone.color }} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
              style={{ background: avatarColor(competitor.name) }}
            >
              {getInitial(competitor.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link to={`/competitors/${competitor.id}`} className="text-base font-bold text-gray-900 hover:text-blue-600 truncate">
                  {competitor.name}
                </Link>
                <span
                  className="text-[9px] font-bold uppercase tracking-[.05em] px-2 py-0.5 rounded-full shrink-0"
                  style={{ color: tone.color, background: tone.bg }}
                >
                  {tone.label}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{competitor.industry ?? formatUrl(competitor.website_url)}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] font-bold uppercase tracking-[.06em] text-gray-400 mb-0.5">Aggression Score</p>
            <p className="font-mono text-xl font-bold" style={{ color: tone.color }}>{aggression.toFixed(1)}%</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 py-4 border-y border-gray-100 mb-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.06em] text-gray-400 mb-1">Current Promotion</p>
            <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
              {intel.lastTitle ?? 'No active promotions detected'}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.06em] text-gray-400 mb-1">Losing Customers Probability</p>
            <p className="text-sm font-semibold leading-snug" style={{ color: churn.label === 'Critical' ? '#e5484d' : churn.label === 'Moderate' ? '#d9920a' : '#1f9d5b' }}>
              {churn.label} ({churn.prob}%)
            </p>
          </div>
        </div>

        <div className="rounded-xl p-3.5 flex gap-2.5 mb-4" style={{ background: isHigh ? '#fdeceb' : '#fdf3e3' }}>
          <span className="text-base shrink-0">{isHigh ? '🚨' : '⚡'}</span>
          <div>
            <p className="text-xs font-bold text-gray-800 mb-0.5">Why?</p>
            <p className="text-xs text-gray-600 leading-relaxed">{intel.lastDescription ?? whyText(competitor.name, intel)}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            to={isHigh ? '/interception' : `/competitors/${competitor.id}`}
            className="flex-1 inline-flex items-center justify-center gap-2 text-white text-sm font-bold py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all"
            style={{ background: isHigh ? '#e5484d' : '#2563eb' }}
          >
            {isHigh ? '⚡ Launch Counter Campaign' : 'View Intelligence'}
          </Link>
          <Link
            to={`/competitors/${competitor.id}`}
            className="w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:bg-gray-50"
          >
            <Maximize2 size={15} />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Compact intelligence card ────────────────────────────────────────────────

function IntelligenceCard({ competitor, intel }: { competitor: Competitor; intel: IntelStats }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const deleteMutation = useDeleteCompetitor()

  const aggression = computeAggression(intel)
  const tone = threatTone(aggression)

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-blue-200 hover:shadow-sm transition-all" style={{ boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
        <div className="h-1" style={{ background: tone.color }} />
        <div className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white font-bold text-base shrink-0"
              style={{ background: avatarColor(competitor.name) }}
            >
              {getInitial(competitor.name)}
            </div>
            <div className="flex-1 min-w-0">
              <Link to={`/competitors/${competitor.id}`} className="text-sm font-bold text-gray-900 hover:text-blue-600 block truncate">
                {competitor.name}
              </Link>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <a href={competitor.website_url} target="_blank" rel="noreferrer" className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-0.5">
                  {formatUrl(competitor.website_url)}
                  <ExternalLink size={9} />
                </a>
                {competitor.industry && <Badge variant="info">{competitor.industry}</Badge>}
              </div>
            </div>
            <div className="relative shrink-0">
              <button onClick={() => setMenuOpen(o => !o)} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100">
                <MoreVertical size={15} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg border border-gray-200 shadow-lg z-10">
                  <button onClick={() => { setEditOpen(true); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remove ${competitor.name}?`)) deleteMutation.mutate(competitor.id); setMenuOpen(false) }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-lg font-bold" style={{ color: tone.color }}>{aggression.toFixed(1)}%</span>
            <span className="text-[10px] font-bold uppercase tracking-[.05em] px-2 py-0.5 rounded-[5px]" style={{ color: tone.color, background: tone.bg }}>
              {tone.label}
            </span>
          </div>

          <p className="text-xs text-gray-500 leading-snug mb-3 line-clamp-2">
            {intel.lastTitle ? intel.lastTitle : 'No active public promotions detected.'}
            {!intel.lastTitle && <span className="block text-emerald-600 font-medium mt-1">No overlap with our commercial strategy detected this quarter.</span>}
          </p>

          <div className="flex items-center gap-2 pt-3" style={{ borderTop: '1px solid #f1f2f4' }}>
            <span className="text-[10.5px] text-gray-400 flex-1">{timeAgo(intel.lastAt)}</span>
            <Link to={`/competitors/${competitor.id}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline">
              View Intel <ArrowRight size={10} />
            </Link>
          </div>
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
    <div className="bg-white border border-gray-200 rounded-2xl p-5" style={{ boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Gauge size={16} className="text-gray-400" />
        <h3 className="text-sm font-bold text-gray-900">Signal Activity Index</h3>
      </div>
      {ranked.every(r => r.intel.total7d === 0) ? (
        <p className="text-xs text-gray-400">No competitor activity detected in the last 7 days.</p>
      ) : (
        <div className="space-y-3">
          {ranked.map(({ c, intel }) => {
            const tone = threatTone(computeAggression(intel))
            const pct = Math.max(4, (intel.total7d / max) * 100)
            return (
              <div key={c.id}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-semibold text-gray-700 truncate">{c.name}</span>
                  <span className="text-xs font-mono font-bold" style={{ color: tone.color }}>{intel.total7d} signals/wk</span>
                </div>
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone.color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-[10.5px] text-gray-400 mt-4">Aggregated from detected page changes across tracked competitors.</p>
    </div>
  )
}

// ── AI Reconnaissance widget ─────────────────────────────────────────────────

function AiReconnaissance({ competitors }: { competitors: Competitor[] }) {
  const newest = [...competitors].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const isRecent = newest && Date.now() - new Date(newest.created_at).getTime() < 7 * 86400000

  return (
    <div className="rounded-2xl p-5 text-white flex flex-col justify-between" style={{ background: 'linear-gradient(135deg,#3525cd 0%,#2b1a9e 100%)' }}>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Radar size={16} className="text-white/80" />
          <h3 className="text-sm font-bold">AI Reconnaissance</h3>
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
  const { user } = useAuth()
  const [addOpen, setAddOpen] = useState(false)
  const { data: competitors = [], isLoading } = useCompetitors()

  const { data: recentChanges = [] } = useQuery({
    queryKey: ['competitors_intel', user?.id],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data } = await supabase
        .from('detected_changes')
        .select('competitor_id, severity, change_type, detected_at, title, description')
        .eq('user_id', user!.id)
        .gte('detected_at', weekAgo)
        .order('detected_at', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
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

  const heroCompetitors = sortedCompetitors.slice(0, 2)
  const restCompetitors = sortedCompetitors.slice(2)

  const totalSignals7d = recentChanges.length
  const highThreats = recentChanges.filter(c => c.severity === 'high').length
  const volatility = highThreats >= 3 ? 'High' : (highThreats >= 1 || totalSignals7d >= 5) ? 'Moderate' : 'Low'
  const volatilityColor = volatility === 'High' ? '#e5484d' : volatility === 'Moderate' ? '#d9920a' : '#1f9d5b'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Competitor Intelligence</h1>
          <p className="text-gray-500 text-sm mt-1 max-w-xl">
            Real-time tracking of aggressive movements in your market sectors. AI-driven threat assessment and recommended counter-actions.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 py-2" style={{ boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
            <Gauge size={13} style={{ color: volatilityColor }} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Market Volatility</span>
            <span className="text-xs font-bold" style={{ color: volatilityColor }}>{volatility}</span>
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
          {/* Hero threat cards */}
          {heroCompetitors.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {heroCompetitors.map(c => (
                <ThreatHeroCard key={c.id} competitor={c} intel={intelMap[c.id] ?? EMPTY_INTEL} />
              ))}
            </div>
          )}

          {/* Remaining competitors + widgets row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {restCompetitors.map(c => (
              <IntelligenceCard key={c.id} competitor={c} intel={intelMap[c.id] ?? EMPTY_INTEL} />
            ))}
            <SignalActivityIndex competitors={competitors} intelMap={intelMap} />
            <AiReconnaissance competitors={competitors} />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <ShieldAlert size={13} />
            {competitors.length} tracked · <span className="text-emerald-600 font-medium">{competitors.filter(c => c.is_active).length} active monitoring</span>
          </div>
        </>
      )}

      <CompetitorForm open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
