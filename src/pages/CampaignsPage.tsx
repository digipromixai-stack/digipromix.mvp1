import { useState } from 'react'
import {
  Rocket, Search, Globe, Share2, Trash2, Play, Pause,
  CheckCircle2, FileEdit, TrendingUp, Plus, Users, Link2, ExternalLink, Copy,
  AlertTriangle, TrendingDown, ZapOff, DollarSign, Sparkles, RefreshCw,
  Target, Brain, X, Check, ChevronDown, ChevronUp, BarChart2, Pencil,
  Settings, BarChart, Zap,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '../components/ui/Toast'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useCampaigns, useUpdateCampaignStatus, useDeleteCampaign, useUpdateCampaignBudget } from '../hooks/useCampaigns'
// useUpdateCampaignStatus also used inside RecommendationCard for pause_campaign action
import {
  useAiRecommendations,
  useApplyRecommendation,
  useDismissRecommendation,
  type AiRecommendationWithCampaign,
} from '../hooks/useAiRecommendations'
import { useCampaignMetrics } from '../hooks/useCampaignMetrics'
import { timeAgo } from '../lib/utils'
import type { Campaign, CampaignStatus } from '../types/database.types'

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-600',     icon: FileEdit       },
  active:    { label: 'Active',    color: 'bg-green-100 text-green-700',   icon: Play           },
  paused:    { label: 'Paused',    color: 'bg-yellow-100 text-yellow-700', icon: Pause          },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-700',       icon: AlertTriangle  },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-700',     icon: CheckCircle2   },
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  google:    Search,
  meta:      Globe,
  instagram: Share2,
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  // Defensive fallback — if the DB ever returns a status not yet known to the
  // frontend (older or newer enum value), render a neutral chip instead of crashing.
  const cfg = STATUS_CONFIG[status] ?? {
    label: status, color: 'bg-gray-100 text-gray-600', icon: FileEdit,
  }
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

// ── AI Recommendations panel ──────────────────────────────────────────────────

const ACTION_META: Record<string, {
  icon: React.ElementType
  label: string
  color: string       // text colour
  bg: string          // background
  border: string      // border
  applyLabel?: string // custom button label
}> = {
  rising_cpc:         { icon: TrendingUp,   label: 'Rising CPC',          color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200'    },
  declining_ctr:      { icon: TrendingDown, label: 'Declining CTR',       color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-200' },
  conversion_drop:    { icon: Target,       label: 'Conversion Drop',     color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200'    },
  ad_fatigue:         { icon: ZapOff,       label: 'Ad Fatigue',          color: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-200' },
  pause_campaign:     { icon: Pause,        label: 'Pause Suggested',     color: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-200', applyLabel: 'Pause now' },
  scale_campaign:     { icon: TrendingUp,   label: 'Scale Up',            color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200'  },
  adjust_budget:      { icon: DollarSign,   label: 'Adjust Budget',       color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'   },
  change_creative:    { icon: Sparkles,     label: 'Refresh Creative',    color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-200' },
  change_audience:    { icon: Users,        label: 'Change Audience',     color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  reactivate:         { icon: RefreshCw,    label: 'Reactivate',          color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200'  },
  launch_campaign:    { icon: Rocket,       label: 'Launch Now',          color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'   },
  setup_tracking:     { icon: Settings,     label: 'Connect Ad Account',  color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-200', applyLabel: 'Go to Settings' },
  performance_check:  { icon: BarChart,     label: 'Performance Check',   color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200',   applyLabel: 'Got it' },
}

const FALLBACK_META = { icon: Brain, label: 'AI Insight', color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200', applyLabel: undefined }

function PriorityBadge({ priority }: { priority: number }) {
  if (priority >= 5) return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700">Urgent</span>
  if (priority >= 4) return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">High</span>
  if (priority >= 3) return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">Medium</span>
  return null
}

function RecommendationCard({ rec }: { rec: AiRecommendationWithCampaign }) {
  const [expanded, setExpanded] = useState(false)
  const { mutate: applyMutation, isPending: applying   } = useApplyRecommendation()
  const { mutate: dismiss,       isPending: dismissing } = useDismissRecommendation()
  const { mutate: updateStatus,  isPending: pausing    } = useUpdateCampaignStatus()
  const { toast } = useToast()
  const navigate  = useNavigate()
  const meta = ACTION_META[rec.action_type] ?? FALLBACK_META
  const Icon = meta.icon

  // ── Unified apply handler with per-type actions ───────────────────────────
  const handleApply = () => {
    const markDone = () =>
      applyMutation(rec.id, {
        onSuccess: () => toast('Insight marked as done', 'success'),
        onError:   (e) => toast(`Could not mark done: ${(e as Error).message}`, 'error'),
      })

    switch (rec.action_type) {
      // Navigate to Settings so the user can connect their ad account
      case 'setup_tracking':
        navigate('/settings')
        markDone()
        break

      // Actually pause the linked campaign on Meta/Google
      case 'pause_campaign':
        if (!rec.campaign_id) { markDone(); break }
        updateStatus(
          {
            id: rec.campaign_id,
            status: 'paused',
            metaCampaignId:   null,  // manage-meta-campaign fetches this from DB
            googleCampaignId: null,
          },
          {
            onSuccess: () => {
              toast('Campaign paused', 'success')
              markDone()
            },
            onError: (e) => toast(`Pause failed: ${(e as Error).message}`, 'error'),
          },
        )
        break

      // All other types → just mark done with a toast
      default:
        markDone()
        break
    }
  }

  const isBusy = applying || dismissing || pausing

  return (
    <div className={`border ${meta.border} ${meta.bg} rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bg} border ${meta.border}`}>
          <Icon size={15} className={meta.color} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-bold ${meta.color}`}>{meta.label}</span>
            <PriorityBadge priority={rec.priority} />
            {rec.confidence != null && (
              <span className="text-[10px] text-gray-400 font-mono">{Math.round(rec.confidence * 100)}% confidence</span>
            )}
            {rec.campaigns && (
              <span className="text-[10px] text-gray-400 truncate max-w-[140px]">
                · {rec.campaigns.campaign_name}
              </span>
            )}
          </div>

          {/* Recommendation text */}
          <p className="text-sm font-semibold text-gray-900 leading-snug">{rec.recommendation}</p>

          {/* Rationale (expandable) */}
          {rec.rationale && (
            <div className="mt-1">
              {expanded && <p className="text-xs text-gray-500">{rec.rationale}</p>}
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 mt-0.5"
              >
                {expanded ? <><ChevronUp size={11} /> Less</> : <><ChevronDown size={11} /> Why?</>}
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleApply}
            disabled={isBusy}
            title={meta.applyLabel ?? 'Mark as applied'}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {isBusy ? '…' : <><Check size={11} /> {meta.applyLabel ?? 'Apply'}</>}
          </button>
          <button
            onClick={() => dismiss(rec.id, {
              onSuccess: () => toast('Insight dismissed', 'info'),
              onError:   (e) => toast(`Error: ${(e as Error).message}`, 'error'),
            })}
            disabled={isBusy}
            title="Dismiss"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            {dismissing ? '…' : <X size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}

function TopRecommendationCard({ rec }: { rec: AiRecommendationWithCampaign }) {
  const { mutate: applyMutation, isPending: applying   } = useApplyRecommendation()
  const { mutate: dismiss,       isPending: dismissing } = useDismissRecommendation()
  const { mutate: updateStatus,  isPending: pausing    } = useUpdateCampaignStatus()
  const { toast } = useToast()
  const navigate  = useNavigate()

  const handleApply = () => {
    const markDone = () =>
      applyMutation(rec.id, {
        onSuccess: () => toast('Insight applied', 'success'),
        onError:   (e) => toast(`Error: ${(e as Error).message}`, 'error'),
      })
    switch (rec.action_type) {
      case 'setup_tracking': navigate('/settings'); markDone(); break
      case 'pause_campaign':
        if (!rec.campaign_id) { markDone(); break }
        updateStatus({ id: rec.campaign_id, status: 'paused', metaCampaignId: null, googleCampaignId: null }, {
          onSuccess: () => { toast('Campaign paused', 'success'); markDone() },
          onError:   (e) => toast(`Pause failed: ${(e as Error).message}`, 'error'),
        }); break
      default: markDone(); break
    }
  }

  return (
    <TopAIAction
      rec={rec}
      onApply={handleApply}
      onDismiss={() => dismiss(rec.id, {
        onSuccess: () => toast('Insight dismissed', 'info'),
        onError:   (e) => toast(`Error: ${(e as Error).message}`, 'error'),
      })}
      busy={applying || dismissing || pausing}
    />
  )
}

function TopAIAction({ rec, onApply, onDismiss, busy }: {
  rec: AiRecommendationWithCampaign
  onApply: () => void
  onDismiss: () => void
  busy: boolean
}) {
  const meta = ACTION_META[rec.action_type] ?? FALLBACK_META
  return (
    <div className="bg-gradient-to-r from-violet-50 via-indigo-50 to-blue-50 border border-violet-200 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-600 shrink-0 shadow-md">
        <Brain size={22} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-600">AI Priority Action</span>
          <PriorityBadge priority={rec.priority} />
          {rec.confidence != null && (
            <span className="text-[10px] text-violet-500 font-mono">{Math.round(rec.confidence * 100)}% confidence</span>
          )}
        </div>
        <p className="text-base font-bold text-gray-900 leading-snug">{rec.recommendation}</p>
        {rec.campaigns && (
          <p className="text-xs text-gray-500 mt-0.5">Campaign: <span className="font-medium text-gray-700">{rec.campaigns.campaign_name}</span></p>
        )}
        <p className="text-xs text-violet-600 font-semibold mt-1.5 flex items-center gap-1">
          <Zap size={11} /> {meta.label}
        </p>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <button
          onClick={onApply}
          disabled={busy}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-sm flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
        >
          <Check size={13} /> {meta.applyLabel ?? 'Apply'}
        </button>
        <button
          onClick={onDismiss}
          disabled={busy}
          className="px-3 py-1.5 text-xs text-violet-500 hover:text-violet-700 font-medium text-center disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

function AiRecommendationsPanel() {
  const { data: recs = [], isLoading } = useAiRecommendations()

  if (isLoading || recs.length === 0) return null

  const urgentCount = recs.filter(r => r.priority >= 4).length
  const [topRec, ...restRecs] = recs

  return (
    <div className="space-y-3">
      {/* Top-priority violet hero card */}
      <TopRecommendationCard rec={topRec} />

      {/* Remaining insights */}
      {restRecs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3 border-b border-gray-100">
            <Brain size={14} className="text-violet-600" />
            <span className="text-sm font-bold text-gray-900">More AI Insights</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${urgentCount > 1 ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-700'}`}>
              {restRecs.length}
            </span>
          </div>
          <div className="px-5 pb-5 space-y-3 pt-4">
            {restRecs.map(rec => <RecommendationCard key={rec.id} rec={rec} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Campaign card ─────────────────────────────────────────────────────────────

// ── Campaign performance metrics panel ───────────────────────────────────────
function MetricsPanel({ campaignId }: { campaignId: string }) {
  const { data: m } = useCampaignMetrics(campaignId)

  if (!m?.has_data) {
    return (
      <p className="text-[11px] text-gray-400 italic mt-1">
        Performance data collected nightly — check back after 24h of running
      </p>
    )
  }

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))

  return (
    <div className="grid grid-cols-4 gap-1.5 mt-2">
      {[
        { label: 'Spend',       value: `$${m.total_spend.toFixed(2)}`,            color: 'text-gray-900' },
        { label: 'Clicks',      value: fmt(m.total_clicks),                        color: 'text-blue-700' },
        { label: 'Impressions', value: fmt(m.total_impressions),                   color: 'text-gray-700' },
        { label: 'CTR',         value: m.avg_ctr != null ? `${m.avg_ctr.toFixed(1)}%` : '—', color: 'text-green-700' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-gray-50 rounded-lg p-1.5 text-center">
          <div className="text-[9px] uppercase tracking-wide text-gray-400">{label}</div>
          <div className={`text-xs font-bold ${color} mt-0.5`}>{value}</div>
        </div>
      ))}
    </div>
  )
}

// ── Budget edit inline ────────────────────────────────────────────────────────
function BudgetEdit({ campaign }: { campaign: Campaign }) {
  const [editing, setEditing]   = useState(false)
  const [value,   setValue]     = useState(String(campaign.daily_budget ?? ''))
  const { mutate: updateBudget, isPending } = useUpdateCampaignBudget()
  const { toast } = useToast()

  const save = () => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 1) return
    updateBudget({
      id: campaign.id,
      daily_budget: n,
      metaCampaignId: campaign.meta_campaign_id,
      googleCampaignId: campaign.google_campaign_id,
    }, {
      onSuccess: () => {
        setEditing(false)
        toast(
          campaign.meta_campaign_id
            ? `Budget updated to $${n}/day — synced to Meta`
            : `Budget updated to $${n}/day`,
          'success'
        )
      },
      onError: (e) => toast(`Budget update failed: ${(e as Error).message}`, 'error'),
    })
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
      >
        <DollarSign size={10} />
        {campaign.daily_budget ? `$${campaign.daily_budget}/day` : 'Set budget'}
        <Pencil size={9} className="ml-0.5" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400">$</span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        autoFocus
        className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <span className="text-xs text-gray-400">/day</span>
      <button onClick={save} disabled={isPending} className="text-[10px] text-green-600 font-semibold hover:underline">
        {isPending ? '…' : 'Save'}
      </button>
      <button onClick={() => setEditing(false)} className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
    </div>
  )
}

// ── Campaign card ─────────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateCampaignStatus()
  const { mutate: deleteCampaign, isPending: deleting } = useDeleteCampaign()
  const [showMetrics, setShowMetrics] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:shadow-sm transition-shadow">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-orange-50 shrink-0 mt-0.5">
            <Rocket size={16} className="text-orange-500" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-gray-900">{campaign.campaign_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Counter to <span className="font-medium text-gray-600">{campaign.competitor_name}</span>
                  {campaign.competitor_event && (
                    <> · <span className="italic">{campaign.competitor_event}</span></>
                  )}
                </p>
              </div>
              <StatusBadge status={campaign.status} />
            </div>

            <p className="text-sm text-gray-700 mt-2 line-clamp-2 font-medium">{campaign.headline}</p>

            {campaign.offer && (
              <p className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded mt-1.5 inline-block">
                🎯 {campaign.offer}
              </p>
            )}

            {campaign.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {campaign.keywords.slice(0, 4).map(kw => (
                  <span key={kw} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                    {kw}
                  </span>
                ))}
                {campaign.keywords.length > 4 && (
                  <span className="text-xs text-gray-400">+{campaign.keywords.length - 4} more</span>
                )}
              </div>
            )}

            {/* Landing page link */}
            {campaign.slug && campaign.published && (
              <div className="flex items-center gap-2 mt-2">
                <Link2 size={11} className="text-indigo-400 shrink-0" />
                <code className="text-xs text-indigo-600 truncate flex-1">/lp/{campaign.slug}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/lp/${campaign.slug}`)}
                  className="p-1 rounded text-indigo-400 hover:bg-indigo-50"
                  title="Copy landing page link"
                ><Copy size={11} /></button>
                <a href={`/lp/${campaign.slug}`} target="_blank" rel="noreferrer"
                  className="p-1 rounded text-indigo-400 hover:bg-indigo-50"
                ><ExternalLink size={11} /></a>
              </div>
            )}

            {/* Budget edit */}
            <div className="mt-2">
              <BudgetEdit campaign={campaign} />
            </div>

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {/* Channels */}
              {campaign.channels.length > 0 && (
                <div className="flex items-center gap-1">
                  {campaign.channels.map(ch => {
                    const Icon = CHANNEL_ICONS[ch] ?? Globe
                    return <Icon key={ch} size={13} className="text-gray-400" />
                  })}
                </div>
              )}
              {/* Views + leads + conversion rate */}
              {campaign.views_count > 0 && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span>{campaign.views_count} view{campaign.views_count !== 1 ? 's' : ''}</span>
                </div>
              )}
              {campaign.leads_count > 0 && (
                <div className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                  <Users size={12} />
                  {campaign.leads_count} lead{campaign.leads_count !== 1 ? 's' : ''}
                  {campaign.views_count > 0 && (
                    <span className="text-gray-400 font-normal ml-0.5">
                      ({Math.round((campaign.leads_count / campaign.views_count) * 100)}% CVR)
                    </span>
                  )}
                </div>
              )}
              <span className="text-xs text-gray-400">{timeAgo(campaign.created_at)}</span>

              {/* Performance toggle */}
              {(campaign.meta_campaign_id || campaign.google_campaign_id) && (
                <button
                  onClick={() => setShowMetrics(v => !v)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <BarChart2 size={11} />
                  {showMetrics ? 'Hide stats' : 'Stats'}
                  {showMetrics ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1.5 ml-auto">
                {campaign.status === 'active' && (
                  <button
                    onClick={() => updateStatus({
                      id: campaign.id,
                      status: 'paused',
                      googleCampaignId: campaign.google_campaign_id,
                      metaCampaignId: campaign.meta_campaign_id,
                    })}
                    disabled={updatingStatus}
                    className="text-xs px-2.5 py-1 rounded-lg border border-yellow-200 text-yellow-700 hover:bg-yellow-50 transition-colors disabled:opacity-50"
                  >
                    {updatingStatus ? '...' : 'Pause'}
                  </button>
                )}
                {(campaign.status === 'draft' || campaign.status === 'paused') && (
                  <button
                    onClick={() => updateStatus({
                      id: campaign.id,
                      status: 'active',
                      googleCampaignId: campaign.google_campaign_id,
                      metaCampaignId: campaign.meta_campaign_id,
                    })}
                    disabled={updatingStatus}
                    className="text-xs px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                  >
                    {updatingStatus ? '...' : campaign.status === 'draft' ? 'Activate' : 'Resume'}
                  </button>
                )}
                {campaign.status === 'active' && (
                  <button
                    onClick={() => updateStatus({
                      id: campaign.id,
                      status: 'completed',
                      googleCampaignId: campaign.google_campaign_id,
                      metaCampaignId: campaign.meta_campaign_id,
                    })}
                    disabled={updatingStatus}
                    className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    Complete
                  </button>
                )}
                <button
                  onClick={() => {
                    const hasGoogle = !!campaign.google_campaign_id
                    const hasMeta   = !!campaign.meta_campaign_id
                    const platforms = [hasGoogle && 'Google Ads', hasMeta && 'Meta'].filter(Boolean).join(' & ')
                    const msg = platforms
                      ? `Delete this campaign from the app AND ${platforms}?`
                      : 'Delete this campaign?'
                    if (confirm(msg)) deleteCampaign({
                      id: campaign.id,
                      googleCampaignId: campaign.google_campaign_id,
                      metaCampaignId: campaign.meta_campaign_id,
                    })
                  }}
                  disabled={deleting}
                  className="text-xs p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? '...' : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          </div>

          {/* Performance metrics panel */}
          {showMetrics && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5 flex items-center gap-1">
                <BarChart2 size={10} /> Performance (last 30 days · updated nightly)
              </p>
              <MetricsPanel campaignId={campaign.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CampaignsPage() {
  const { data: campaigns = [], isLoading } = useCampaigns()
  const [filter, setFilter] = useState<CampaignStatus | 'all'>('all')

  const filtered = filter === 'all' ? campaigns : campaigns.filter(c => c.status === filter)

  const stats = {
    total:  campaigns.length,
    active: campaigns.filter(c => c.status === 'active').length,
    draft:  campaigns.filter(c => c.status === 'draft').length,
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Brain size={15} className="text-violet-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-violet-600">AI Campaign Intelligence</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI-generated counter-campaigns from competitor moves</p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-sm shrink-0"
        >
          <Plus size={14} />
          New from signal
        </Link>
      </div>

      {/* Stats */}
      {!isLoading && campaigns.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total',  value: stats.total,  icon: TrendingUp, color: 'text-gray-700'  },
            { label: 'Active', value: stats.active,  icon: Play,       color: 'text-green-600' },
            { label: 'Drafts', value: stats.draft,   icon: FileEdit,   color: 'text-gray-400'  },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon size={13} className={color} />
                <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* AI Recommendations panel — only visible when optimize-campaigns has flagged issues */}
      <AiRecommendationsPanel />

      {/* Filter tabs */}
      {campaigns.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'active', 'draft', 'paused', 'completed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors capitalize ${
                filter === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title={filter === 'all' ? 'No campaigns yet' : `No ${filter} campaigns`}
          description={
            filter === 'all'
              ? 'Go to the Dashboard, find a competitor signal and click "Launch Counter Campaign" to generate your first AI campaign.'
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(c => <CampaignCard key={c.id} campaign={c} />)}
        </div>
      )}
    </div>
  )
}
