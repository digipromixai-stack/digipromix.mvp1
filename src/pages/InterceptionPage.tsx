import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ExternalLink, CheckCircle2, Zap, Sparkles, ArrowRight, HelpCircle,
} from 'lucide-react'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { CampaignModal } from '../components/campaigns/CampaignModal'
import { useDetectedChanges } from '../hooks/useDetectedChanges'
import { useCampaigns } from '../hooks/useCampaigns'
import { useValuePerLead } from '../hooks/useProfile'
import { industryBaseline } from '../lib/economics'
import { timeAgo } from '../lib/utils'
import type { Campaign, DetectedChangeWithCompetitor } from '../types/database.types'

// ── Design tokens ─────────────────────────────────────────────────────────────

const SEV: Record<string, { label: string; badge: string }> = {
  high:   { label: 'HIGH',   badge: 'bg-danger text-white' },
  medium: { label: 'MEDIUM', badge: 'bg-warning text-white' },
  low:    { label: 'LOW',    badge: 'bg-primary text-white' },
}

const TYPE: Record<string, { color: string; bg: string; label: string }> = {
  promotion:        { color: 'text-pink-600',   bg: 'bg-pink-50',   label: 'Promotion' },
  price_change:     { color: 'text-warning',    bg: 'bg-orange-tint', label: 'Price Change' },
  campaign_launch:  { color: 'text-danger',     bg: 'bg-red-tint',  label: 'Campaign Launch' },
  new_landing_page: { color: 'text-primary',    bg: 'bg-indigo-tint', label: 'New Landing Page' },
  new_blog_post:    { color: 'text-success',    bg: 'bg-success/10', label: 'New Blog Post' },
  banner_change:    { color: 'text-violet-600', bg: 'bg-violet-50', label: 'Banner Change' },
  content_change:   { color: 'text-on-surface-variant', bg: 'bg-surface-container-low', label: 'Content Change' },
}

const AVATAR_COLORS = [
  '#3525cd', '#c2683a', '#2f8f7d', '#a83278',
  '#5b6477', '#c43d3d', '#2563eb', '#1f9d5b',
]

function avatarColor(name = '') {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 65) % AVATAR_COLORS.length]
}

function getInitial(name = '') { return (name[0] ?? '?').toUpperCase() }

// ── Helpers: generate counter content from real signal data ───────────────────

function genHeadlines(c: DetectedChangeWithCompetitor): [string, string] {
  const comp = c.competitors?.name ?? 'Competitor'
  const t = c.change_type
  if (t === 'price_change')
    return [`Beat ${comp}'s New Pricing — Get More for Less`, `${comp} Changed Prices — Here's Your Better Deal`]
  if (t === 'promotion' || t === 'campaign_launch')
    return [`Beat ${comp}'s Deal — Our Exclusive Offer Inside`, `Better Than ${comp}'s Deal — Limited Time`]
  if (t === 'new_landing_page')
    return [`${comp} Is Targeting New Customers — So Are We`, `Don't Let ${comp} Win That Traffic`]
  return [`${comp} Just Made a Move — Here's Your Counter`, `Stay Ahead of ${comp} with This Offer`]
}

function genPrimaryText(c: DetectedChangeWithCompetitor): string {
  const comp = c.competitors?.name ?? 'competitor'
  if (c.description) return c.description.length > 180 ? c.description.slice(0, 177) + '…' : c.description
  return `${comp} just made a move in the market. Now is the perfect time to capture their undecided customers with a targeted counter-campaign — before they convert.`
}

function genOffer(c: DetectedChangeWithCompetitor): string {
  const t = c.change_type
  if (t === 'price_change') return 'better value · price match guarantee'
  if (t === 'promotion') return 'exclusive limited-time offer'
  if (t === 'campaign_launch') return 'our competitive advantage'
  return 'tailored offer for switchers'
}

type SignalFilter = 'all' | 'high' | 'price_change' | 'promotion' | 'campaign_launch'

// ── Signal row ──────────────────────────────────────────────────────────────

function CampaignSignalRow({
  change,
  activeCampaign,
  onCounter,
  valuePerLead,
}: {
  change: DetectedChangeWithCompetitor
  activeCampaign: Campaign | null
  onCounter: () => void
  valuePerLead: number
}) {
  const sev  = SEV[change.severity] ?? SEV.low
  const typ  = TYPE[change.change_type] ?? TYPE.content_change
  const comp = change.competitors?.name ?? 'Unknown'
  const domain = change.competitors?.website_url?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? ''
  const industry = change.competitors?.industry ?? 'General'

  const isLive = activeCampaign != null && activeCampaign.status !== 'draft'
  const headline = activeCampaign?.headline ?? genHeadlines(change)[0]

  const budget   = change.severity === 'high' ? 180 : change.severity === 'medium' ? 140 : 100
  const baseline = industryBaseline(industry)
  const cpc      = baseline.cpc
  const weekly   = budget * 7
  const leads    = Math.max(1, Math.round((weekly / cpc) * baseline.conversionRate))
  const revenue  = leads * valuePerLead

  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-soft hover:shadow-soft-md transition-shadow">

      {/* Left: identity */}
      <div className="flex sm:flex-col gap-3 sm:gap-2 sm:w-36 shrink-0">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0"
          style={{ background: avatarColor(comp) }}
        >
          {getInitial(comp)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-on-surface leading-snug">{comp}</p>
          {domain && <p className="text-[11px] text-on-surface-variant truncate">{domain}</p>}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${typ.color} ${typ.bg}`}>
              {typ.label}
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${sev.badge}`}>
              {sev.label}
            </span>
          </div>
          <p className="text-[11px] text-on-surface-variant/70 mt-1">{timeAgo(change.detected_at)}</p>
        </div>
      </div>

      {/* Middle: content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-on-surface leading-snug mb-1">{change.title}</p>
        {change.description && (
          <p className="text-xs text-on-surface-variant mb-3 line-clamp-2">{change.description}</p>
        )}

        <div className={`rounded-xl p-3 mb-3 ${isLive ? 'bg-success/10' : 'bg-indigo-tint'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1 ${isLive ? 'text-success' : 'text-primary'}`}>
            <Sparkles size={11} />
            {isLive ? 'Active Counter Campaign' : 'AI Recommended Counter'}
          </p>
          <p className={`text-sm font-bold italic leading-snug ${isLive ? 'text-success' : 'text-primary'}`}>
            "{headline}"
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-0.5">Est. Leads</p>
            <p className="font-mono text-sm font-bold text-on-surface">{leads}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-0.5">Est. Revenue</p>
            <p className="font-mono text-sm font-bold text-on-surface">€{revenue.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-0.5">Avg. CPC</p>
            <p className="font-mono text-sm font-bold text-on-surface">€{cpc.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Right: action */}
      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:w-52 shrink-0 gap-2">
        {isLive ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 px-3 py-1.5 rounded-lg">
              <CheckCircle2 size={13} /> Live
            </span>
            <p className="text-xs text-on-surface-variant text-right">{activeCampaign?.campaign_name}</p>
            <Link to="/campaigns" className="text-xs font-semibold text-primary inline-flex items-center gap-1 hover:underline">
              View Analytics <ArrowRight size={11} />
            </Link>
          </>
        ) : (
          <>
            <button
              onClick={onCounter}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-primary hover:opacity-90 text-white text-sm font-bold py-2.5 px-4 rounded-xl transition-all shrink-0"
            >
              <Zap size={14} /> Launch Counter Campaign
            </button>
            {change.monitored_pages?.url && (
              <a
                href={change.monitored_pages.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-primary inline-flex items-center gap-1 hover:underline"
              >
                View Change <ExternalLink size={11} />
              </a>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function InterceptionPage() {
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all')
  const [interceptTarget, setInterceptTarget] = useState<DetectedChangeWithCompetitor | null>(null)

  const { data: changes = [], isLoading } = useDetectedChanges({ limit: 100 })
  const { data: campaigns = [] }          = useCampaigns()
  const valuePerLead = useValuePerLead()

  const campaignByChangeId = useMemo(() => {
    const map = new Map<string, Campaign>()
    for (const c of campaigns) {
      if (c.change_id) map.set(c.change_id, c)
    }
    return map
  }, [campaigns])

  const visibleSignals = useMemo(() => {
    let list = changes
    if (signalFilter === 'high') list = list.filter(c => c.severity === 'high')
    else if (signalFilter !== 'all') list = list.filter(c => c.change_type === signalFilter)
    return list.slice(0, 50)
  }, [changes, signalFilter])

  function handleLaunch(change: DetectedChangeWithCompetitor) {
    setInterceptTarget(change)
  }

  const targetHeadlines = interceptTarget ? genHeadlines(interceptTarget) : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-1">Counter Campaigns</h1>
          <p className="text-sm text-on-surface-variant">
            Every competitor move, with an AI counter-campaign ready to launch.
          </p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {([
          { id: 'all',             label: 'All' },
          { id: 'high',            label: 'High Threat' },
          { id: 'price_change',    label: 'Price Changes' },
          { id: 'promotion',       label: 'Promotions' },
          { id: 'campaign_launch', label: 'Campaign Launches' },
        ] as const).map(f => (
          <button
            key={f.id}
            onClick={() => setSignalFilter(f.id)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
              signalFilter === f.id
                ? 'bg-primary text-white shadow-soft'
                : 'bg-surface-card border border-outline-variant text-on-surface-variant hover:border-primary/40'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-on-surface-variant inline-flex items-center gap-1">
          <HelpCircle size={12} />
          Showing {visibleSignals.length} threat{visibleSignals.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : visibleSignals.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No signals yet"
          description="Add competitors and monitor their pages — when they make a move, it appears here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {visibleSignals.map(c => (
            <CampaignSignalRow
              key={c.id}
              change={c}
              activeCampaign={campaignByChangeId.get(c.id) ?? null}
              onCounter={() => handleLaunch(c)}
              valuePerLead={valuePerLead}
            />
          ))}
        </div>
      )}

      {/* Campaign modal — pre-filled with AI-generated content */}
      {interceptTarget && targetHeadlines && (
        <CampaignModal
          change={interceptTarget}
          open
          onClose={() => setInterceptTarget(null)}
          counterHint={{
            budget:      interceptTarget.severity === 'high' ? 180 : interceptTarget.severity === 'medium' ? 140 : 100,
            channels:    ['meta', 'google'],
            headline:    targetHeadlines[0],
            primaryText: genPrimaryText(interceptTarget),
            offer:       genOffer(interceptTarget),
          }}
        />
      )}
    </div>
  )
}
