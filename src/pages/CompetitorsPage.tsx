import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Building2, ExternalLink, Globe, MoreVertical, Pencil, Trash2, Zap, TrendingUp, ShieldAlert, ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useCompetitors, useDeleteCompetitor } from '../hooks/useCompetitors'
import { CompetitorForm } from '../components/competitors/CompetitorForm'
import { Button } from '../components/ui/Button'
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

interface IntelStats {
  total7d:  number
  high7d:   number
  types:    string[]
  lastAt:   string | null
}

// ── Intelligence competitor card ──────────────────────────────────────────────

function IntelligenceCard({ competitor, intel }: { competitor: Competitor; intel: IntelStats }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const deleteMutation = useDeleteCompetitor()

  const aggression = Math.min(100, intel.high7d * 20 + intel.total7d * 7)
  const aggressionLabel = aggression >= 70 ? 'HIGH' : aggression >= 35 ? 'MEDIUM' : 'LOW'
  const aggressionColor = aggression >= 70 ? '#e5484d' : aggression >= 35 ? '#d9920a' : '#1f9d5b'
  const aggressionBg    = aggression >= 70 ? '#fdeceb' : aggression >= 35 ? '#fdf3e3' : '#e9f7ef'

  const urgency = intel.high7d > 0 ? 'HIGH' : intel.total7d > 3 ? 'MEDIUM' : 'LOW'
  const urgencyColor = urgency === 'HIGH' ? '#e5484d' : urgency === 'MEDIUM' ? '#d9920a' : '#1f9d5b'

  const lastActivity = intel.lastAt
    ? (() => {
        const diff = Date.now() - new Date(intel.lastAt).getTime()
        const h = Math.floor(diff / 3600000)
        if (h < 24) return `${h}h ago`
        return `${Math.floor(h / 24)}d ago`
      })()
    : 'No recent activity'

  const typeLabels: Record<string, string> = {
    promotion: 'Promotion', price_change: 'Price Change', campaign_launch: 'Campaign Launch',
    new_landing_page: 'New Page', banner_change: 'Banner', content_change: 'Content', new_blog_post: 'Blog Post',
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-blue-200 hover:shadow-sm transition-all" style={{ boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>

        {/* Severity bar */}
        <div className="h-1" style={{ background: aggressionColor }} />

        <div className="p-4">
          {/* Top row: avatar + name + menu */}
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white font-bold text-base shrink-0"
              style={{ background: avatarColor(competitor.name) }}
            >
              {getInitial(competitor.name)}
            </div>
            <div className="flex-1 min-w-0">
              <Link
                to={`/competitors/${competitor.id}`}
                className="text-sm font-bold text-gray-900 hover:text-blue-600 block truncate"
              >
                {competitor.name}
              </Link>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <a
                  href={competitor.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-0.5"
                >
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

          {/* Intelligence metrics */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {/* Aggression */}
            <div className="rounded-[10px] p-2.5 text-center" style={{ background: aggressionBg }}>
              <div className="font-mono text-lg font-bold leading-none" style={{ color: aggressionColor }}>{aggression}</div>
              <div className="text-[9px] font-bold uppercase tracking-[.06em] mt-1" style={{ color: aggressionColor }}>Aggression</div>
            </div>
            {/* Signals 7d */}
            <div className="rounded-[10px] p-2.5 text-center" style={{ background: '#fafbfc', border: '1px solid #eceef1' }}>
              <div className="font-mono text-lg font-bold text-gray-900 leading-none">{intel.total7d}</div>
              <div className="text-[9px] font-bold uppercase tracking-[.06em] text-gray-400 mt-1">Signals 7d</div>
            </div>
            {/* High threat */}
            <div className="rounded-[10px] p-2.5 text-center" style={{ background: intel.high7d > 0 ? '#fdeceb' : '#fafbfc', border: '1px solid #eceef1' }}>
              <div className="font-mono text-lg font-bold leading-none" style={{ color: intel.high7d > 0 ? '#e5484d' : '#98a2b3' }}>{intel.high7d}</div>
              <div className="text-[9px] font-bold uppercase tracking-[.06em] mt-1" style={{ color: intel.high7d > 0 ? '#e5484d' : '#98a2b3' }}>High threat</div>
            </div>
          </div>

          {/* Recent signal types */}
          {intel.types.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {intel.types.slice(0, 3).map(t => (
                <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {typeLabels[t] ?? t}
                </span>
              ))}
            </div>
          )}

          {/* Footer row */}
          <div className="flex items-center gap-2 pt-3" style={{ borderTop: '1px solid #f1f2f4' }}>
            <span className="text-[10.5px] text-gray-400 flex-1">{lastActivity}</span>
            <span
              className="text-[10px] font-bold uppercase tracking-[.05em] px-2 py-0.5 rounded-[5px]"
              style={{ color: urgencyColor, background: urgency === 'HIGH' ? '#fdeceb' : urgency === 'MEDIUM' ? '#fdf3e3' : '#e9f7ef' }}
            >
              {urgency} urgency
            </span>
            {intel.high7d > 0 && (
              <Link
                to="/interception"
                className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg text-white"
                style={{ background: '#e5484d' }}
              >
                Counter <ArrowRight size={10} />
              </Link>
            )}
          </div>
        </div>
      </div>
      <CompetitorForm open={editOpen} onClose={() => setEditOpen(false)} competitor={competitor} />
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function CompetitorsPage() {
  const { user } = useAuth()
  const [addOpen, setAddOpen] = useState(false)
  const { data: competitors = [], isLoading } = useCompetitors()
  const activeCount = competitors.filter(c => c.is_active).length

  // Fetch recent changes (7d) grouped by competitor for intelligence metrics
  const { data: recentChanges = [] } = useQuery({
    queryKey: ['competitors_intel', user?.id],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data } = await supabase
        .from('detected_changes')
        .select('competitor_id, severity, change_type, detected_at')
        .eq('user_id', user!.id)
        .gte('detected_at', weekAgo)
      return data ?? []
    },
    enabled: !!user,
    refetchInterval: 60000,
  })

  const intelMap = useMemo(() => {
    const map: Record<string, IntelStats> = {}
    for (const c of recentChanges) {
      if (!map[c.competitor_id]) map[c.competitor_id] = { total7d: 0, high7d: 0, types: [], lastAt: null }
      const s = map[c.competitor_id]
      s.total7d++
      if (c.severity === 'high') s.high7d++
      if (!s.types.includes(c.change_type)) s.types.push(c.change_type)
      if (!s.lastAt || c.detected_at > s.lastAt) s.lastAt = c.detected_at
    }
    return map
  }, [recentChanges])

  // Sort: competitors with most recent high-threat activity first
  const sortedCompetitors = useMemo(() => {
    return [...competitors].sort((a, b) => {
      const ia = intelMap[a.id] ?? { total7d: 0, high7d: 0 }
      const ib = intelMap[b.id] ?? { total7d: 0, high7d: 0 }
      return (ib.high7d * 10 + ib.total7d) - (ia.high7d * 10 + ia.total7d)
    })
  }, [competitors, intelMap])

  const totalSignals7d = recentChanges.length
  const highThreats    = recentChanges.filter(c => c.severity === 'high').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <ShieldAlert size={14} className="text-gray-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Competitor Intelligence</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Competitors</h1>
          <p className="text-gray-500 text-sm mt-1">
            {competitors.length} tracked
            {competitors.length > 0 && (
              <>
                <span className="mx-1.5 text-gray-300">·</span>
                <span className="text-emerald-600 font-medium">{activeCount} active</span>
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} fullWidth={false} className="sm:w-auto w-full">
          <Plus size={16} /> Add Competitor
        </Button>
      </div>

      {/* Intelligence summary bar */}
      {!isLoading && competitors.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Signals (7d)',    value: totalSignals7d, color: '#2563eb', dot: '#2563eb' },
            { label: 'High threats',    value: highThreats,    color: highThreats > 0 ? '#e5484d' : '#98a2b3', dot: highThreats > 0 ? '#e5484d' : '#d1d5db' },
            { label: 'Monitored',       value: activeCount,    color: '#1f9d5b', dot: '#1f9d5b' },
          ].map(({ label, value, color, dot }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-3" style={{ boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-2 h-2 rounded-[2px]" style={{ background: dot }} />
                <span className="text-[11px] font-semibold text-gray-500">{label}</span>
              </div>
              <div className="font-mono text-2xl font-bold" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <PageSpinner />
      ) : competitors.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No competitors yet"
          description="Add your first competitor to start monitoring their website for pricing changes, promotions, and feature updates."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Add Competitor
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {sortedCompetitors.map(c => (
            <IntelligenceCard
              key={c.id}
              competitor={c}
              intel={intelMap[c.id] ?? { total7d: 0, high7d: 0, types: [], lastAt: null }}
            />
          ))}
        </div>
      )}

      <CompetitorForm open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}
