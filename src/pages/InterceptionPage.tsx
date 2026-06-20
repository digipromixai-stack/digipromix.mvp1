import { useState, useMemo } from 'react'
import {
  ExternalLink, CheckCircle2, RefreshCw, ArrowRight,
  DollarSign, ShieldAlert, Zap, Users, Rocket,
} from 'lucide-react'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { CampaignModal } from '../components/campaigns/CampaignModal'
import { useDetectedChanges } from '../hooks/useDetectedChanges'
import { useCampaigns } from '../hooks/useCampaigns'
import { useLeadStats } from '../hooks/useLeads'
import { timeAgo } from '../lib/utils'
import type { DetectedChangeWithCompetitor } from '../types/database.types'

// ── Design tokens ─────────────────────────────────────────────────────────────

const SEV: Record<string, { color: string; bg: string; label: string }> = {
  high:   { color: '#e5484d', bg: '#fdeceb', label: 'HIGH THREAT' },
  medium: { color: '#d9920a', bg: '#fdf3e3', label: 'MEDIUM' },
  low:    { color: '#1f9d5b', bg: '#e9f7ef', label: 'LOW' },
}

const TYPE: Record<string, { color: string; bg: string; label: string }> = {
  promotion:        { color: '#a83278', bg: '#fcebf4', label: 'Promotion' },
  price_change:     { color: '#c2683a', bg: '#fbf0e8', label: 'Price Change' },
  campaign_launch:  { color: '#c43d3d', bg: '#fdeceb', label: 'Campaign Launch' },
  new_landing_page: { color: '#2563eb', bg: '#eaf1fe', label: 'New Landing Page' },
  new_blog_post:    { color: '#2f8f7d', bg: '#e8f7f4', label: 'New Blog Post' },
  banner_change:    { color: '#7c5cd1', bg: '#f1ecfb', label: 'Banner Change' },
  content_change:   { color: '#667085', bg: '#f2f4f7', label: 'Content Change' },
}

const AVATAR_COLORS = [
  '#3b6fb5','#9a4f96','#c2683a','#2f8f7d',
  '#5b6477','#c43d3d','#2563eb','#1f9d5b',
]

function avatarColor(name = '') {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 65) % AVATAR_COLORS.length]
}

function getInitial(name = '') { return (name[0] ?? '?').toUpperCase() }

// Per-change-type CPC baseline ($/click)
const CPC_MAP: Record<string, number> = {
  Healthcare: 4.50, 'Local-services': 3.20, SaaS: 6.50, Finance: 8.00,
}
const DEFAULT_CPC = 3.50
const CONV_RATE  = 0.11
const VALUE_PER_LEAD = 150

// ── Helpers: generate counter content from real signal data ───────────────────

function genHeadlines(c: DetectedChangeWithCompetitor): [string, string] {
  const comp = c.competitors?.name ?? 'Competitor'
  const t = c.change_type
  if (t === 'price_change')
    return [`Beat ${comp}'s New Pricing — Get More for Less`, `${comp} Changed Prices — Here's Your Better Deal`]
  if (t === 'promotion' || t === 'campaign_launch')
    return [`We'll Top That — Our Exclusive Offer Inside`, `Better Than ${comp}'s Deal — Limited Time`]
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

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, dot, valueColor = '#0f1722' }: {
  label: string; value: string | number; sub: string; dot: string; valueColor?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-[13px] px-4 py-[15px]" style={{ boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: dot }} />
        <span className="text-[11px] font-semibold text-gray-500 tracking-[.01em]">{label}</span>
      </div>
      <div className="font-mono text-[27px] font-bold leading-none tracking-[-0.02em]" style={{ color: valueColor }}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-1.5">{sub}</div>
    </div>
  )
}

// ── Signal card ───────────────────────────────────────────────────────────────

function SignalCard({
  change, selected, countered, onSelect, onCounter,
}: {
  change: DetectedChangeWithCompetitor
  selected: boolean
  countered: boolean
  onSelect: () => void
  onCounter: () => void
}) {
  const sev  = SEV[change.severity]  ?? SEV.low
  const typ  = TYPE[change.change_type] ?? TYPE.content_change
  const comp = change.competitors?.name ?? 'Unknown'
  const industry = change.competitors?.industry ?? ''
  const isPrice  = change.change_type === 'price_change'
  const isPromo  = change.change_type === 'promotion' || change.change_type === 'campaign_launch'
  const isText   = ['new_landing_page','banner_change','content_change'].includes(change.change_type)

  const cardStyle: React.CSSProperties = {
    boxShadow: selected
      ? '0 0 0 3px rgba(37,99,235,.18), 0 6px 18px rgba(16,24,40,.12)'
      : '0 1px 2px rgba(16,24,40,.04)',
  }

  return (
    <div
      onClick={onSelect}
      className="flex overflow-hidden rounded-2xl border cursor-pointer transition-all"
      style={{
        borderColor: selected ? '#2563eb' : '#e8eaee',
        ...cardStyle,
      }}
    >
      {/* Severity left bar */}
      <div className="w-1 shrink-0" style={{ background: sev.color }} />

      {/* Content */}
      <div className="flex-1 min-w-0 p-4">

        {/* Top row: avatar + meta */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white font-bold text-base shrink-0"
            style={{ background: avatarColor(comp) }}
          >
            {getInitial(comp)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900">{comp}</span>
              {industry && <span className="text-[11px] text-gray-400">{industry}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span
                className="text-[10px] font-bold uppercase tracking-[.05em] px-1.5 py-0.5 rounded-[5px]"
                style={{ color: typ.color, background: typ.bg }}
              >{typ.label}</span>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.04em] px-2 py-0.5 rounded-[5px]"
                style={{ color: sev.color, background: sev.bg }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sev.color }} />
                {sev.label}
              </span>
              <span className="text-[11px] text-gray-400">{timeAgo(change.detected_at)}</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        <p className="text-sm font-semibold text-gray-900 mt-3 leading-snug">{change.title}</p>

        {/* Price detail */}
        {isPrice && change.description && (
          <div
            className="inline-flex items-center gap-3 mt-3 px-3.5 py-2.5 rounded-[10px]"
            style={{ background: '#fafbfc', border: '1px solid #eceef1' }}
          >
            <div className="text-center">
              <div className="text-[9px] font-bold uppercase tracking-[.08em] text-gray-400 mb-1">Before</div>
              <div className="font-mono text-[15px] font-semibold text-gray-400 line-through">—</div>
            </div>
            <ArrowRight size={16} className="text-gray-300 shrink-0" />
            <div className="text-center">
              <div className="text-[9px] font-bold uppercase tracking-[.08em] text-gray-400 mb-1">After</div>
              <div className="font-mono text-[15px] font-bold" style={{ color: '#e5484d' }}>↓ Lower</div>
            </div>
            <p className="text-xs text-gray-500 ml-2 max-w-[200px] line-clamp-2">{change.description}</p>
          </div>
        )}

        {/* Promo / campaign launch detail */}
        {isPromo && change.description && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-600 line-clamp-2">{change.description}</p>
          </div>
        )}

        {/* Text delta (new page / banner / content) */}
        {isText && change.description && (
          <div
            className="flex items-start gap-2 mt-3 px-3 py-2.5 rounded-[10px]"
            style={{ background: '#f3f8ff', border: '1px solid #dbe8fd' }}
          >
            <span className="text-blue-600 font-bold text-sm shrink-0 mt-0.5">→</span>
            <span className="text-xs text-blue-700 font-medium leading-relaxed">{change.description}</span>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center gap-2 mt-3 pt-3"
          style={{ borderTop: '1px solid #f1f2f4' }}
          onClick={e => e.stopPropagation()}
        >
          {change.monitored_pages?.url && (
            <a
              href={change.monitored_pages.url}
              target="_blank"
              rel="noreferrer"
              className="text-[11.5px] text-gray-400 hover:text-gray-600 inline-flex items-center gap-1 no-underline"
            >
              View change <ExternalLink size={10} />
            </a>
          )}
          <div className="flex-1" />
          {countered && (
            <span
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1.5 rounded-lg"
              style={{ color: '#1f9d5b', background: '#e9f7ef' }}
            >
              <CheckCircle2 size={12} /> Counter live
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onCounter() }}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-bold px-3.5 py-1.5 rounded-lg cursor-pointer transition-colors"
            style={selected
              ? { color: '#fff', background: '#2563eb', border: '1px solid #2563eb' }
              : { color: '#2563eb', background: '#eaf1fe', border: '1px solid #cfe0fc' }
            }
          >
            {countered ? 'Adjust' : selected ? 'Selected' : 'Counter it'}
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Counter-play panel ────────────────────────────────────────────────────────

function CounterPlayPanel({
  change,
  budget,
  onBudget,
  useMeta,
  useGoogle,
  onToggleMeta,
  onToggleGoogle,
  variantIdx,
  onRegenerate,
  launched,
  onLaunch,
}: {
  change: DetectedChangeWithCompetitor | null
  budget: number
  onBudget: (v: number) => void
  useMeta: boolean
  useGoogle: boolean
  onToggleMeta: () => void
  onToggleGoogle: () => void
  variantIdx: number
  onRegenerate: () => void
  launched: boolean
  onLaunch: () => void
}) {
  if (!change) return null

  const comp = change.competitors?.name ?? 'Competitor'
  const industry = change.competitors?.industry ?? 'General'
  const headlines = genHeadlines(change)
  const headline  = headlines[variantIdx % headlines.length]
  const primaryText = genPrimaryText(change)
  const offer = genOffer(change)
  const confidence = change.severity === 'high' ? 91 : change.severity === 'medium' ? 78 : 65

  const cpc    = CPC_MAP[industry] ?? DEFAULT_CPC
  const weekly = budget * 7
  const leads  = Math.max(1, Math.round((weekly / cpc) * CONV_RATE))
  const cpl    = Math.round(weekly / leads)
  const roi    = ((leads * VALUE_PER_LEAD) / weekly).toFixed(1)

  const fillPct = ((budget - 50) / 450) * 100
  const sliderBg = `linear-gradient(90deg,#2563eb ${fillPct}%,#e8eaee ${fillPct}%)`

  const channels = [useMeta && 'Meta', useGoogle && 'Google'].filter(Boolean).join(' + ') || 'no channels'

  const ChipOn  = { background: '#eaf1fe', border: '1.5px solid #2563eb' }
  const ChipOff = { background: '#fff', border: '1.5px solid #e8eaee' }

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{ border: '1px solid #e8eaee', boxShadow: '0 6px 24px rgba(16,24,40,.07)' }}
    >
      {/* Dark header */}
      <div
        className="px-5 py-[18px] text-white"
        style={{ background: 'linear-gradient(180deg,#0b0f17,#12182a)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] px-2.5 py-1 rounded-md"
            style={{ color: '#b9c4ff', background: 'rgba(109,74,255,.18)', border: '1px solid rgba(109,74,255,.35)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b9c4ff" strokeWidth="2">
              <path d="M12 2 9.2 9.2 2 12l7.2 2.8L12 22l2.8-7.2L22 12l-7.2-2.8z"/>
            </svg>
            AI counter-play
          </span>
          <div className="flex-1" />
          <span className="font-mono text-[11px] font-semibold" style={{ color: '#8fffc4' }}>
            {confidence}% confidence
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-[9px] flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: avatarColor(comp) }}
          >{getInitial(comp)}</div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[.04em] mb-0.5" style={{ color: '#7a869c' }}>
              Responding to {comp}
            </div>
            <div className="text-[13px] font-semibold leading-snug">{change.title.slice(0, 60)}{change.title.length > 60 ? '…' : ''}</div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">

        {/* Generated campaign */}
        <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid #e8eaee' }}>
          <div
            className="flex items-center px-3.5 py-2.5"
            style={{ background: '#fafbfc', borderBottom: '1px solid #eceef1' }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[.06em] text-gray-400">Generated campaign</span>
            <div className="flex-1" />
            <button
              onClick={onRegenerate}
              className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold bg-transparent border-none cursor-pointer"
              style={{ color: '#6d4aff' }}
            >
              <RefreshCw size={11} style={{ color: '#6d4aff' }} />
              Regenerate
            </button>
          </div>
          <div className="p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-gray-300 mb-1.5">Headline</div>
            <p className="text-[15px] font-bold text-gray-900 leading-snug tracking-[-0.01em]">{headline}</p>
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-gray-300 mt-3.5 mb-1.5">Primary text</div>
            <p className="text-[12.5px] text-gray-500 leading-relaxed line-clamp-3">{primaryText}</p>
            <div className="mt-3">
              <span
                className="inline-flex items-center gap-1.5 text-[12.5px] font-bold px-3 py-1.5 rounded-lg"
                style={{ color: '#1f9d5b', background: '#e9f7ef', border: '1px solid #c3ebd4' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1f9d5b" strokeWidth="2.2">
                  <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 1.4.6l6.4 6.4a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>
                </svg>
                Your offer: {offer}
              </span>
            </div>
          </div>
        </div>

        {/* Channels */}
        <div>
          <div className="text-[11px] font-bold tracking-[.04em] text-gray-500 mb-2">Channels</div>
          <div className="flex gap-2.5">
            <button
              onClick={onToggleMeta}
              className="flex-1 flex items-center gap-2.5 p-3 rounded-[10px] cursor-pointer text-left transition-all"
              style={useMeta ? ChipOn : ChipOff}
            >
              <span className="w-6 h-6 rounded-md flex items-center justify-center text-white font-extrabold text-sm shrink-0" style={{ background: '#1877f2' }}>f</span>
              <span className="flex-1">
                <span className="text-[12.5px] font-bold block text-gray-900">Meta</span>
                <span className="text-[10px] text-gray-400">FB · Instagram</span>
              </span>
              <span
                className="w-[18px] h-[18px] rounded-full shrink-0"
                style={useMeta
                  ? { background: '#2563eb', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")`, backgroundSize: '11px', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
                  : { border: '1.5px solid #b6bcc7' }
                }
              />
            </button>
            <button
              onClick={onToggleGoogle}
              className="flex-1 flex items-center gap-2.5 p-3 rounded-[10px] cursor-pointer text-left transition-all"
              style={useGoogle ? ChipOn : ChipOff}
            >
              <span className="w-6 h-6 rounded-md flex items-center justify-center font-extrabold text-sm shrink-0" style={{ background: '#fff', border: '1px solid #e8eaee', color: '#4285f4' }}>G</span>
              <span className="flex-1">
                <span className="text-[12.5px] font-bold block text-gray-900">Google</span>
                <span className="text-[10px] text-gray-400">Search ads</span>
              </span>
              <span
                className="w-[18px] h-[18px] rounded-full shrink-0"
                style={useGoogle
                  ? { background: '#2563eb', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")`, backgroundSize: '11px', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
                  : { border: '1.5px solid #b6bcc7' }
                }
              />
            </button>
          </div>
        </div>

        {/* Budget slider */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold tracking-[.04em] text-gray-500">Daily budget</span>
            <span className="font-mono text-base font-bold text-gray-900">
              ${budget}<span className="text-[11px] font-medium text-gray-400">/day</span>
            </span>
          </div>
          <input
            type="range" min={50} max={500} step={10} value={budget}
            onChange={e => onBudget(parseInt(e.target.value, 10))}
            className="w-full"
            style={{ background: sliderBg, height: '6px', borderRadius: '99px', outline: 'none', appearance: 'none', WebkitAppearance: 'none' }}
          />
          <div className="flex justify-between mt-1.5 font-mono text-[10px] text-gray-300">
            <span>$50</span>
            <span>${(budget * 7).toLocaleString()}/wk</span>
            <span>$500</span>
          </div>
        </div>

        {/* Business Impact row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-[11px] p-3 text-center" style={{ background: '#fafbfc', border: '1px solid #eceef1' }}>
            <div className="font-mono text-xl font-bold text-gray-900 leading-none">{leads}</div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[.03em] text-gray-400 mt-1.5">Pred. leads</div>
          </div>
          <div className="rounded-[11px] p-3 text-center" style={{ background: '#fafbfc', border: '1px solid #eceef1' }}>
            <div className="font-mono text-xl font-bold text-gray-900 leading-none">${cpl}</div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[.03em] text-gray-400 mt-1.5">Cost / lead</div>
          </div>
          <div className="rounded-[11px] p-3 text-center" style={{ background: '#e9f7ef', border: '1px solid #c3ebd4' }}>
            <div className="font-mono text-xl font-bold leading-none" style={{ color: '#1f9d5b' }}>{roi}×</div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[.03em] mt-1.5" style={{ color: '#1f9d5b' }}>Est. ROI</div>
          </div>
        </div>

        {/* Potential Revenue */}
        <div className="rounded-[11px] px-3.5 py-2.5 flex items-center gap-3" style={{ background: 'linear-gradient(135deg,#f0f7ff,#eef2ff)', border: '1px solid #dbe8fd' }}>
          <DollarSign size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
          <div className="flex-1">
            <div className="text-[9.5px] font-bold uppercase tracking-[.06em] text-blue-400 mb-0.5">Potential revenue</div>
            <div className="font-mono text-[15px] font-bold" style={{ color: '#2563eb' }}>
              ${(leads * VALUE_PER_LEAD).toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9.5px] font-bold uppercase tracking-[.06em] text-gray-400 mb-0.5">Confidence</div>
            <div className="font-mono text-[13px] font-bold text-gray-700">{confidence}%</div>
          </div>
        </div>

        {/* AI Campaign Simulator */}
        <div>
          <div className="text-[11px] font-bold tracking-[.04em] text-gray-500 mb-2 flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-violet-500">
              <path d="M12 2 9.2 9.2 2 12l7.2 2.8L12 22l2.8-7.2L22 12l-7.2-2.8z"/>
            </svg>
            AI Campaign Simulator
          </div>
          <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid #e8eaee' }}>
            <div className="px-3.5 py-2 flex items-center" style={{ background: '#fafbfc', borderBottom: '1px solid #eceef1' }}>
              <span className="text-[10px] font-bold uppercase tracking-[.06em] text-gray-400">Predicted leads by channel</span>
              <span className="ml-auto text-[10px] font-semibold" style={{ color: '#6d4aff' }}>⭐ = Recommended</span>
            </div>
            {(() => {
              const channels = [
                { label: 'Instagram', emoji: '📸', multiplier: 1.35, best: true  },
                { label: 'Google Ads', emoji: 'G',  multiplier: 1.0,  best: false },
                { label: 'WhatsApp',  emoji: '💬', multiplier: 0.65, best: false },
              ]
              return channels.map(({ label, emoji, multiplier, best }) => {
                const chLeads = Math.max(1, Math.round(leads * multiplier))
                const chRoi   = ((chLeads * VALUE_PER_LEAD) / weekly).toFixed(1)
                return (
                  <div
                    key={label}
                    className="flex items-center gap-3 px-3.5 py-2.5"
                    style={{ borderBottom: '1px solid #f5f6f8', background: best ? '#f8f9ff' : '#fff' }}
                  >
                    <span className="w-6 h-6 rounded-md flex items-center justify-center text-sm shrink-0" style={{ background: '#f1f2f4', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
                      {emoji}
                    </span>
                    <span className="flex-1 text-[12.5px] font-semibold text-gray-700">{label}</span>
                    <span className="font-mono text-[12.5px] font-bold text-gray-900">{chLeads} leads</span>
                    <span className="font-mono text-[11px] text-gray-400 ml-2">{chRoi}× ROI</span>
                    {best && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1" style={{ background: '#e9f7ef', color: '#1f9d5b' }}>⭐ Best</span>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <DollarSign size={12} className="text-gray-300 shrink-0" />
          {industry} CPC baseline ${cpc.toFixed(2)} · ${(budget * 7).toLocaleString()}/wk spend
        </div>

        {/* Launch / launched */}
        {launched ? (
          <div className="rounded-[12px] p-4 flex items-start gap-3" style={{ background: '#e9f7ef', border: '1px solid #c3ebd4' }}>
            <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#1f9d5b' }}>
              <CheckCircle2 size={16} className="text-white" />
            </span>
            <div className="flex-1">
              <div className="text-[13.5px] font-bold" style={{ color: '#1f9d5b' }}>Counter-campaign launched</div>
              <div className="text-[11.5px] mt-0.5 opacity-85" style={{ color: '#1f9d5b' }}>Live on {channels} · ${budget}/day</div>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={onLaunch}
              className="w-full flex items-center justify-center gap-2 py-3.5 text-white text-sm font-bold rounded-[11px] border-none cursor-pointer transition-colors"
              style={{ background: '#2563eb', boxShadow: '0 4px 14px rgba(37,99,235,.32)' }}
            >
              <Rocket size={15} />
              Launch counter-campaign
            </button>
            <p className="text-center text-[10.5px] text-gray-400 -mt-2">
              Campaigns launch paused — you approve spend in Meta &amp; Google.
            </p>
          </>
        )}

      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function InterceptionPage() {
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [budget, setBudget]             = useState(180)
  const [useMeta, setUseMeta]           = useState(true)
  const [useGoogle, setUseGoogle]       = useState(true)
  const [variantMap, setVariantMap]     = useState<Record<string, number>>({})
  const [launchedSet, setLaunchedSet]   = useState<Set<string>>(new Set())
  const [signalFilter, setSignalFilter] = useState<'all' | 'high' | 'not_countered'>('all')
  const [interceptTarget, setInterceptTarget] = useState<DetectedChangeWithCompetitor | null>(null)

  const { data: changes = [], isLoading } = useDetectedChanges({ limit: 100 })
  const { data: campaigns = [] }          = useCampaigns()
  const { data: leadStats }               = useLeadStats()

  const interceptedIds = useMemo(
    () => new Set(
      campaigns
        .filter(c => c.status !== 'draft')
        .map(c => c.change_id)
        .filter(Boolean)
    ),
    [campaigns],
  )

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayCount    = changes.filter(c => new Date(c.detected_at) >= today).length
  const highCount     = changes.filter(c => c.severity === 'high').length
  const thirtyAgo     = new Date(Date.now() - 30 * 86400000)
  const recentChanges = changes.filter(c => new Date(c.detected_at) >= thirtyAgo)
  const recentCamps   = campaigns.filter(c => new Date(c.created_at) >= thirtyAgo)
  const responseRate  = recentChanges.length > 0
    ? Math.round((recentCamps.length / recentChanges.length) * 100)
    : 0

  const visibleSignals = useMemo(() => {
    let list = changes
    if (signalFilter === 'high')          list = list.filter(c => c.severity === 'high')
    if (signalFilter === 'not_countered') list = list.filter(c => !interceptedIds.has(c.id))
    return list.slice(0, 50)
  }, [changes, signalFilter, interceptedIds])

  const selectedChange = useMemo(() => {
    const id = selectedId ?? visibleSignals[0]?.id ?? null
    return changes.find(c => c.id === id) ?? visibleSignals[0] ?? null
  }, [selectedId, visibleSignals, changes])

  function handleSelect(id: string) {
    const s = changes.find(c => c.id === id)
    setSelectedId(id)
    if (s) setBudget(s.severity === 'high' ? 180 : s.severity === 'medium' ? 140 : 100)
  }

  function handleLaunch() {
    if (!selectedChange) return
    setInterceptTarget(selectedChange)
  }

  function markLaunched(launched?: boolean) {
    if (launched && selectedChange) {
      setLaunchedSet(prev => new Set([...prev, selectedChange.id]))
    }
    setInterceptTarget(null)
  }

  const selId = selectedChange?.id ?? ''
  const isLaunched = launchedSet.has(selId) || interceptedIds.has(selId)

  return (
    <div style={{ maxWidth: '1480px' }}>

      {/* ── Header ── */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert size={15} className="text-gray-500" />
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Counter-Play Command Center</span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold ml-1" style={{ color: '#1f9d5b' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#1f9d5b' }} />
            live
          </span>
        </div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-gray-900">Counter-Play Command Center</h1>
        <p className="text-[13.5px] text-gray-500 mt-1">
          Every competitor move, with a counter-campaign ready to launch.{' '}
          {highCount > 0 && <strong className="text-gray-900">{highCount} high-threat signal{highCount !== 1 ? 's' : ''} need a response today.</strong>}
        </p>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Signals today"     value={todayCount}         sub="across competitors"   dot="#2563eb" />
        <KpiCard label="High-threat (7d)"  value={highCount}          sub="need a response"      dot="#e5484d" valueColor="#e5484d" />
        <KpiCard label="Customers captured" value={leadStats?.total ?? 0} sub={`${leadStats?.qualified ?? 0} qualified`} dot="#1f9d5b" />
        <KpiCard label="Response rate"     value={`${responseRate}%`} sub="moves acted on (30d)" dot="#6d4aff" />
      </div>

      {/* ── Main 2-col layout ── */}
      <div className="flex gap-5 items-start">

        {/* Left: signal feed */}
        <div className="flex-1 min-w-0">

          {/* Section header + filters */}
          <div className="flex items-center gap-2.5 mb-3.5">
            <span className="text-xs font-bold uppercase tracking-[.1em] text-gray-400">Live competitor signals</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: '#1f9d5b' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#1f9d5b' }} />
              live
            </span>
            <div className="flex-1" />
            <div className="flex gap-1.5">
              {([
                { id: 'all',           label: 'All' },
                { id: 'high',          label: 'High threat' },
                { id: 'not_countered', label: 'Not countered' },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setSignalFilter(f.id)}
                  className="text-[11.5px] font-semibold px-3 py-1.5 rounded-[7px] cursor-pointer border transition-colors"
                  style={signalFilter === f.id
                    ? { color: '#0f1722', background: '#fff', border: '1px solid #e8eaee' }
                    : { color: '#98a2b3', background: 'transparent', border: '1px solid transparent' }
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
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
            <div className="flex flex-col gap-3">
              {visibleSignals.map(c => (
                <SignalCard
                  key={c.id}
                  change={c}
                  selected={(selectedChange?.id ?? visibleSignals[0]?.id) === c.id}
                  countered={interceptedIds.has(c.id) || launchedSet.has(c.id)}
                  onSelect={() => handleSelect(c.id)}
                  onCounter={() => { handleSelect(c.id); setInterceptTarget(c) }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: sticky counter-play panel */}
        <div className="w-[412px] shrink-0 sticky top-0">
          {selectedChange ? (
            <CounterPlayPanel
              change={selectedChange}
              budget={budget}
              onBudget={setBudget}
              useMeta={useMeta}
              useGoogle={useGoogle}
              onToggleMeta={() => setUseMeta(v => !v)}
              onToggleGoogle={() => setUseGoogle(v => !v)}
              variantIdx={variantMap[selId] ?? 0}
              onRegenerate={() => setVariantMap(m => ({ ...m, [selId]: ((m[selId] ?? 0) + 1) }))}
              launched={isLaunched}
              onLaunch={handleLaunch}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-48 bg-white border border-gray-200 rounded-2xl text-center px-6">
              <Users size={28} className="text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-500">Select a signal</p>
              <p className="text-xs text-gray-400 mt-1">Click any competitor signal to generate your AI counter-play</p>
            </div>
          )}
        </div>

      </div>

      {/* Campaign modal — pre-filled with the panel's computed content */}
      {interceptTarget && (() => {
        const targetVariant = variantMap[interceptTarget.id] ?? 0
        const headlines = genHeadlines(interceptTarget)
        const industry  = interceptTarget.competitors?.industry ?? 'General'
        const cpc       = CPC_MAP[industry] ?? DEFAULT_CPC
        const weekly    = budget * 7
        const leads     = Math.max(1, Math.round((weekly / cpc) * CONV_RATE))
        const channels  = [useMeta && 'meta', useGoogle && 'google'].filter(Boolean) as string[]
        return (
          <CampaignModal
            change={interceptTarget}
            open
            onClose={markLaunched}
            counterHint={{
              budget:      budget,
              channels:    channels.length > 0 ? channels : ['meta'],
              headline:    headlines[targetVariant % headlines.length],
              primaryText: genPrimaryText(interceptTarget),
              offer:       genOffer(interceptTarget),
            }}
          />
        )
      })()}
    </div>
  )
}
