import { useState } from 'react'
import {
  Rocket, Search, Globe, Share2, Trash2, Play, Pause,
  CheckCircle2, FileEdit, TrendingUp, Plus, Users, Link2, ExternalLink, Copy,
  AlertTriangle, TrendingDown, ZapOff, DollarSign, Sparkles, RefreshCw,
  Target, Brain, X, Check, ChevronDown, ChevronUp, BarChart2, Pencil,
  Settings, BarChart, LayoutList, Columns, Mail,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '../components/ui/Toast'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useCampaigns, useUpdateCampaignStatus, useDeleteCampaign, useUpdateCampaignBudget } from '../hooks/useCampaigns'
import {
  useAiRecommendations,
  useApplyRecommendation,
  useDismissRecommendation,
  type AiRecommendationWithCampaign,
} from '../hooks/useAiRecommendations'
import { useCampaignMetrics } from '../hooks/useCampaignMetrics'
import { timeAgo } from '../lib/utils'
import { SourceTag } from '../components/ui/MetricMeta'
import type { Campaign, CampaignStatus } from '../types/database.types'

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'bg-surface-container text-on-surface-variant', icon: FileEdit       },
  active:    { label: 'Active',    color: 'bg-primary-container text-on-primary-container', icon: Play           },
  paused:    { label: 'Paused',    color: 'bg-orange-tint text-warning',   icon: Pause          },
  failed:    { label: 'Failed',    color: 'bg-red-tint text-danger',       icon: AlertTriangle  },
  completed: { label: 'Completed', color: 'bg-surface-container-high text-on-surface',     icon: CheckCircle2   },
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  google:    Search,
  meta:      Globe,
  instagram: Share2,
  email:     Mail,
}

const CHANNEL_LABELS: Record<string, string> = {
  google:    'Google Search',
  meta:      'Meta Ads',
  instagram: 'Instagram',
  email:     'Email',
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-600', icon: FileEdit }
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

// ── AI Recommendations ────────────────────────────────────────────────────────

const ACTION_META: Record<string, {
  icon: React.ElementType
  label: string
  color: string
  bg: string
  border: string
  applyLabel?: string
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

  const handleApply = () => {
    const markDone = () =>
      applyMutation(rec.id, {
        onSuccess: () => toast('Insight marked as done', 'success'),
        onError:   (e) => toast(`Could not mark done: ${(e as Error).message}`, 'error'),
      })
    switch (rec.action_type) {
      case 'setup_tracking':
        navigate('/settings')
        markDone()
        break
      case 'pause_campaign':
        if (!rec.campaign_id) { markDone(); break }
        updateStatus(
          { id: rec.campaign_id, status: 'paused', metaCampaignId: null, googleCampaignId: null },
          {
            onSuccess: () => { toast('Campaign paused', 'success'); markDone() },
            onError: (e) => toast(`Pause failed: ${(e as Error).message}`, 'error'),
          },
        )
        break
      default:
        markDone()
        break
    }
  }

  const isBusy = applying || dismissing || pausing

  return (
    <div className={`border ${meta.border} ${meta.bg} rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bg} border ${meta.border}`}>
          <Icon size={15} className={meta.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-bold ${meta.color}`}>{meta.label}</span>
            <PriorityBadge priority={rec.priority} />
            {rec.confidence != null && (
              <span className="text-[10px] text-gray-400 font-mono">{Math.round(rec.confidence * 100)}% confidence</span>
            )}
            {rec.campaigns && (
              <span className="text-[10px] text-gray-400 truncate max-w-[140px]">· {rec.campaigns.campaign_name}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-on-surface leading-snug">{rec.recommendation}</p>
          {rec.rationale && (
            <div className="mt-1">
              {expanded && <p className="text-xs text-on-surface-variant">{rec.rationale}</p>}
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-[11px] text-on-surface-variant hover:text-on-surface flex items-center gap-0.5 mt-0.5"
              >
                {expanded ? <><ChevronUp size={11} /> Less</> : <><ChevronDown size={11} /> Why?</>}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleApply}
            disabled={isBusy}
            title={meta.applyLabel ?? 'Mark as applied'}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-on-surface text-white hover:opacity-90 disabled:opacity-50 transition-colors"
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
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-white hover:text-on-surface transition-colors disabled:opacity-50"
          >
            {dismissing ? '…' : <X size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Strategic Recommendation bar (bottom, matches Campaign Studio mockup) ──

function AiStrategicBar({ rec }: { rec: AiRecommendationWithCampaign }) {
  const [expanded, setExpanded] = useState(false)
  const { mutate: applyMutation, isPending: applying   } = useApplyRecommendation()
  const { mutate: dismiss,       isPending: dismissing } = useDismissRecommendation()
  const { mutate: updateStatus,  isPending: pausing    } = useUpdateCampaignStatus()
  const { toast } = useToast()
  const navigate = useNavigate()
  const meta = ACTION_META[rec.action_type] ?? FALLBACK_META

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

  const busy = applying || dismissing || pausing

  return (
    <div className="bg-on-surface rounded-xl p-4 sm:p-5 shadow-soft-lg">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">AI Strategic Recommendation</p>
            <p className="text-sm text-white leading-snug">
              {rec.recommendation}
              {rec.campaigns && <span className="text-white/60"> — {rec.campaigns.campaign_name}</span>}
            </p>
            {expanded && rec.rationale && (
              <p className="text-xs text-white/50 mt-1.5">{rec.rationale}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rec.rationale && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-xs font-bold text-white/70 hover:text-white px-3 py-2 rounded-lg border border-white/20 flex items-center gap-1"
            >
              Why? {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={busy}
            className="text-xs font-bold bg-primary hover:opacity-90 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-1.5"
          >
            {busy ? '…' : <><Check size={12} /> {meta.applyLabel ?? 'Apply Change'}</>}
          </button>
          <button
            onClick={() => dismiss(rec.id, {
              onSuccess: () => toast('Insight dismissed', 'info'),
              onError:   (e) => toast(`Error: ${(e as Error).message}`, 'error'),
            })}
            disabled={busy}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function AiRecommendationsPanel() {
  const { data: recs = [], isLoading } = useAiRecommendations()
  if (isLoading || recs.length === 0) return null
  const [topRec, ...restRecs] = recs

  return (
    <div className="space-y-3">
      <AiStrategicBar rec={topRec} />
      {restRecs.length > 0 && (
        <div className="bg-surface-card border border-border-subtle rounded-xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3 border-b border-border-subtle">
            <Brain size={14} className="text-primary" />
            <span className="text-sm font-bold text-on-surface">More AI Insights</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-tint text-primary">{restRecs.length}</span>
          </div>
          <div className="px-5 pb-5 space-y-3 pt-4">
            {restRecs.map(rec => <RecommendationCard key={rec.id} rec={rec} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Metrics / budget (unchanged behavior, retoned) ────────────────────────────

function MetricsPanel({ campaignId }: { campaignId: string }) {
  const { data: m } = useCampaignMetrics(campaignId)
  if (!m?.has_data) {
    return <p className="text-[11px] text-on-surface-variant italic mt-1">Performance data collected nightly — check back after 24h of running</p>
  }
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))

  // These four numbers are real platform data synced nightly from the ad
  // APIs — label the actual source(s) + when they were last refreshed.
  const platforms = [...new Set(m.rows.map(r => r.platform))]
    .map(p => p === 'google' ? 'Google Ads' : 'Meta Ads')
    .join(' + ')
  const latestDate = m.rows[0]?.date // rows are date-desc

  return (
    <div className="mt-2">
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'Spend',       value: `$${m.total_spend.toFixed(2)}`, color: 'text-on-surface' },
          { label: 'Clicks',      value: fmt(m.total_clicks),             color: 'text-primary' },
          { label: 'Impressions', value: fmt(m.total_impressions),        color: 'text-on-surface-variant' },
          { label: 'CTR',         value: m.avg_ctr != null ? `${m.avg_ctr.toFixed(1)}%` : '—', color: 'text-success' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface-container-low rounded-lg p-1.5 text-center">
            <div className="text-[9px] uppercase tracking-wide text-on-surface-variant">{label}</div>
            <div className={`text-xs font-bold ${color} mt-0.5`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <SourceTag source="live" label={platforms} />
        {latestDate && (
          <span className="text-[10px] text-on-surface-variant">Updated {timeAgo(latestDate)}</span>
        )}
      </div>
    </div>
  )
}

function BudgetEdit({ campaign }: { campaign: Campaign }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(campaign.daily_budget ?? ''))
  const { mutate: updateBudget, isPending } = useUpdateCampaignBudget()
  const { toast } = useToast()

  const save = () => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 1) return
    updateBudget({
      id: campaign.id, daily_budget: n,
      metaCampaignId: campaign.meta_campaign_id, googleCampaignId: campaign.google_campaign_id,
    }, {
      onSuccess: () => {
        setEditing(false)
        toast(campaign.meta_campaign_id ? `Budget updated to $${n}/day — synced to Meta` : `Budget updated to $${n}/day`, 'success')
      },
      onError: (e) => toast(`Budget update failed: ${(e as Error).message}`, 'error'),
    })
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface">
        <DollarSign size={10} />
        {campaign.daily_budget ? `$${campaign.daily_budget}/day` : 'Set budget'}
        <Pencil size={9} className="ml-0.5" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-on-surface-variant">$</span>
      <input
        type="number" min={1} value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        autoFocus
        className="w-16 border border-outline-variant rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <span className="text-xs text-on-surface-variant">/day</span>
      <button onClick={save} disabled={isPending} className="text-[10px] text-success font-semibold hover:underline">{isPending ? '…' : 'Save'}</button>
      <button onClick={() => setEditing(false)} className="text-[10px] text-on-surface-variant hover:text-on-surface">Cancel</button>
    </div>
  )
}

// ── List-view campaign card (unchanged behavior, retoned) ─────────────────────

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateCampaignStatus()
  const { mutate: deleteCampaign, isPending: deleting } = useDeleteCampaign()
  const [showMetrics, setShowMetrics] = useState(false)

  return (
    <div className="bg-surface-card rounded-xl border border-border-subtle hover:shadow-soft transition-shadow">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-tint shrink-0 mt-0.5">
            <Rocket size={16} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-on-surface">{campaign.campaign_name}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Counter to <span className="font-medium text-on-surface">{campaign.competitor_name}</span>
                  {campaign.competitor_event && <> · <span className="italic">{campaign.competitor_event}</span></>}
                </p>
              </div>
              <StatusBadge status={campaign.status} />
            </div>

            <p className="text-sm text-on-surface mt-2 line-clamp-2 font-medium">{campaign.headline}</p>

            {campaign.offer && (
              <p className="text-xs text-success bg-emerald-50 px-2 py-1 rounded mt-1.5 inline-block">🎯 {campaign.offer}</p>
            )}

            {campaign.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {campaign.keywords.slice(0, 4).map(kw => (
                  <span key={kw} className="text-xs bg-indigo-tint text-primary px-1.5 py-0.5 rounded">{kw}</span>
                ))}
                {campaign.keywords.length > 4 && <span className="text-xs text-on-surface-variant">+{campaign.keywords.length - 4} more</span>}
              </div>
            )}

            {campaign.slug && campaign.published && (
              <div className="flex items-center gap-2 mt-2">
                <Link2 size={11} className="text-primary/60 shrink-0" />
                <code className="text-xs text-primary truncate flex-1">/lp/{campaign.slug}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/lp/${campaign.slug}`)}
                  className="p-1 rounded text-primary/60 hover:bg-indigo-tint" title="Copy landing page link"
                ><Copy size={11} /></button>
                <a href={`/lp/${campaign.slug}`} target="_blank" rel="noreferrer" className="p-1 rounded text-primary/60 hover:bg-indigo-tint">
                  <ExternalLink size={11} />
                </a>
              </div>
            )}

            <div className="mt-2"><BudgetEdit campaign={campaign} /></div>

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {campaign.channels.length > 0 && (
                <div className="flex items-center gap-1">
                  {campaign.channels.map(ch => {
                    const Icon = CHANNEL_ICONS[ch] ?? Globe
                    return <Icon key={ch} size={13} className="text-on-surface-variant" />
                  })}
                </div>
              )}
              {campaign.views_count > 0 && (
                <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <span>{campaign.views_count} view{campaign.views_count !== 1 ? 's' : ''}</span>
                </div>
              )}
              {campaign.leads_count > 0 && (
                <div className="flex items-center gap-1 text-xs text-success font-semibold">
                  <Users size={12} />
                  {campaign.leads_count} lead{campaign.leads_count !== 1 ? 's' : ''}
                  {campaign.views_count > 0 && (
                    <span className="text-on-surface-variant font-normal ml-0.5">
                      ({Math.round((campaign.leads_count / campaign.views_count) * 100)}% CVR)
                    </span>
                  )}
                </div>
              )}
              <span className="text-xs text-on-surface-variant">{timeAgo(campaign.created_at)}</span>

              {(campaign.meta_campaign_id || campaign.google_campaign_id) && (
                <button
                  onClick={() => setShowMetrics(v => !v)}
                  className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors"
                >
                  <BarChart2 size={11} />
                  {showMetrics ? 'Hide stats' : 'Stats'}
                  {showMetrics ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
              )}

              <div className="flex items-center gap-1.5 ml-auto">
                {campaign.status === 'active' && (
                  <button
                    onClick={() => updateStatus({ id: campaign.id, status: 'paused', googleCampaignId: campaign.google_campaign_id, metaCampaignId: campaign.meta_campaign_id })}
                    disabled={updatingStatus}
                    className="text-xs px-2.5 py-1 rounded-lg border border-warning/30 text-warning hover:bg-orange-tint transition-colors disabled:opacity-50"
                  >{updatingStatus ? '...' : 'Pause'}</button>
                )}
                {(campaign.status === 'draft' || campaign.status === 'paused') && (
                  <button
                    onClick={() => updateStatus({ id: campaign.id, status: 'active', googleCampaignId: campaign.google_campaign_id, metaCampaignId: campaign.meta_campaign_id })}
                    disabled={updatingStatus}
                    className="text-xs px-2.5 py-1 rounded-lg border border-success/30 text-success hover:bg-emerald-50 transition-colors disabled:opacity-50"
                  >{updatingStatus ? '...' : campaign.status === 'draft' ? 'Activate' : 'Resume'}</button>
                )}
                {campaign.status === 'active' && (
                  <button
                    onClick={() => updateStatus({ id: campaign.id, status: 'completed', googleCampaignId: campaign.google_campaign_id, metaCampaignId: campaign.meta_campaign_id })}
                    disabled={updatingStatus}
                    className="text-xs px-2.5 py-1 rounded-lg border border-primary/30 text-primary hover:bg-indigo-tint transition-colors disabled:opacity-50"
                  >Complete</button>
                )}
                <button
                  onClick={() => {
                    const hasGoogle = !!campaign.google_campaign_id
                    const hasMeta   = !!campaign.meta_campaign_id
                    const platforms = [hasGoogle && 'Google Ads', hasMeta && 'Meta'].filter(Boolean).join(' & ')
                    const msg = platforms ? `Delete this campaign from the app AND ${platforms}?` : 'Delete this campaign?'
                    if (confirm(msg)) deleteCampaign({ id: campaign.id, googleCampaignId: campaign.google_campaign_id, metaCampaignId: campaign.meta_campaign_id })
                  }}
                  disabled={deleting}
                  className="text-xs p-1.5 rounded-lg text-danger/70 hover:bg-red-tint hover:text-danger transition-colors disabled:opacity-50"
                >{deleting ? '...' : <Trash2 size={13} />}</button>
              </div>
            </div>
          </div>

          {showMetrics && (
            <div className="mt-3 pt-3 border-t border-border-subtle">
              <p className="text-[10px] uppercase tracking-wide text-on-surface-variant font-semibold mb-1.5 flex items-center gap-1">
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

// ── Kanban card (Campaign Studio style) ────────────────────────────────────────

const KANBAN_ICON_BG: Record<string, string> = {
  google: 'bg-indigo-tint text-primary',
  meta:   'bg-indigo-tint text-primary',
  email:  'bg-orange-tint text-warning',
}

function KanbanCard({ campaign }: { campaign: Campaign }) {
  const { mutate: updateStatus, isPending } = useUpdateCampaignStatus()
  const primaryChannel = campaign.channels[0]
  const ChannelIcon = primaryChannel ? (CHANNEL_ICONS[primaryChannel] ?? Globe) : Rocket
  const iconBg = primaryChannel ? (KANBAN_ICON_BG[primaryChannel] ?? 'bg-indigo-tint text-primary') : 'bg-indigo-tint text-primary'
  const subtitle = [
    primaryChannel ? CHANNEL_LABELS[primaryChannel] ?? primaryChannel : null,
    campaign.competitor_name ? `vs ${campaign.competitor_name}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="bg-surface-card rounded-xl border border-border-subtle p-3.5 hover:shadow-soft-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          <ChannelIcon size={14} />
        </div>
        {campaign.leads_count > 0 && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-success shrink-0">
            {campaign.leads_count} lead{campaign.leads_count !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <p className="text-sm font-bold text-on-surface leading-snug line-clamp-2 mb-1">{campaign.campaign_name}</p>
      {subtitle && <p className="text-xs text-on-surface-variant mb-3 truncate">{subtitle}</p>}

      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-on-surface">
          {campaign.daily_budget ? `$${campaign.daily_budget}/day` : '$0'}
        </span>
        <div className="flex gap-1">
          {campaign.status === 'draft' && (
            <button
              onClick={() => updateStatus({ id: campaign.id, status: 'active', googleCampaignId: campaign.google_campaign_id, metaCampaignId: campaign.meta_campaign_id })}
              disabled={isPending}
              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >Activate</button>
          )}
          {campaign.status === 'active' && (
            <button
              onClick={() => updateStatus({ id: campaign.id, status: 'paused', googleCampaignId: campaign.google_campaign_id, metaCampaignId: campaign.meta_campaign_id })}
              disabled={isPending}
              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-orange-tint text-warning hover:opacity-80 transition-colors disabled:opacity-50"
            >Pause</button>
          )}
          {campaign.status === 'paused' && (
            <button
              onClick={() => updateStatus({ id: campaign.id, status: 'active', googleCampaignId: campaign.google_campaign_id, metaCampaignId: campaign.meta_campaign_id })}
              disabled={isPending}
              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-tint text-primary hover:opacity-80 transition-colors disabled:opacity-50"
            >Resume</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Kanban board ──────────────────────────────────────────────────────────────

const KANBAN_COLS: { status: CampaignStatus; label: string; dot: string; countText: string }[] = [
  { status: 'draft',     label: 'Draft',     dot: 'bg-secondary',  countText: 'text-on-surface-variant' },
  { status: 'active',    label: 'Running',   dot: 'bg-success',    countText: 'text-success' },
  { status: 'paused',    label: 'Paused',    dot: 'bg-warning',    countText: 'text-warning' },
  { status: 'completed', label: 'Completed', dot: 'bg-primary',    countText: 'text-primary' },
]

function KanbanBoard({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <div className="flex gap-3.5 overflow-x-auto pb-4 -mx-1 px-1">
      {KANBAN_COLS.map(col => {
        const colCampaigns = campaigns.filter(c => c.status === col.status)
        return (
          <div key={col.status} className="shrink-0 w-72 flex flex-col bg-surface-container rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-[.06em]">{col.label}</span>
              <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-card ${col.countText}`}>
                {colCampaigns.length}
              </span>
            </div>
            <div className="flex flex-col gap-2.5 min-h-16">
              {colCampaigns.length === 0 ? (
                <div className="border-2 border-dashed border-border-subtle rounded-xl py-6 text-center">
                  <p className="text-[10px] text-on-surface-variant/60 font-semibold">No {col.label.toLowerCase()} campaigns</p>
                </div>
              ) : (
                colCampaigns.map(c => <KanbanCard key={c.id} campaign={c} />)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function CampaignsPage() {
  const { data: campaigns = [], isLoading } = useCampaigns()
  const [filter, setFilter] = useState<CampaignStatus | 'all'>('all')
  const [view, setView] = useState<'list' | 'kanban'>('kanban')
  const [searchQuery, setSearchQuery] = useState('')

  const searched = searchQuery.trim()
    ? campaigns.filter(c => c.campaign_name.toLowerCase().includes(searchQuery.toLowerCase()))
    : campaigns
  const filtered = filter === 'all' ? searched : searched.filter(c => c.status === filter)

  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-primary">Campaign Studio</h1>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            <input
              type="text"
              placeholder="Search campaigns…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border border-outline-variant bg-surface-card rounded-xl pl-9 pr-3 py-2 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <div className="flex items-center rounded-xl border border-outline-variant bg-surface-card overflow-hidden shrink-0">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${view === 'list' ? 'bg-on-surface text-white' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
            ><LayoutList size={13} /> List</button>
            <button
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${view === 'kanban' ? 'bg-on-surface text-white' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
            ><Columns size={13} /> Kanban</button>
          </div>

          <Link
            to="/interception"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:opacity-90 transition-colors shadow-soft shrink-0"
          >
            <Plus size={14} />
            New Campaign
          </Link>
        </div>
      </div>

      {/* AI Recommendations — top priority as a strategic bar, matching mockup */}
      <AiRecommendationsPanel />

      {/* Kanban view */}
      {view === 'kanban' ? (
        isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title="No campaigns yet"
            description="Go to Counter Campaign, find a competitor signal and launch your first AI counter-campaign."
          />
        ) : (
          <KanbanBoard campaigns={searched} />
        )
      ) : (
        <>
          {campaigns.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'active', 'draft', 'paused', 'completed'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors capitalize ${
                    filter === s ? 'bg-on-surface text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                  }`}
                >{s}</button>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title={filter === 'all' ? 'No campaigns yet' : `No ${filter} campaigns`}
              description={filter === 'all' ? 'Go to Counter Campaign, find a competitor signal and click "Launch counter-campaign" to generate your first AI campaign.' : undefined}
            />
          ) : (
            <div className="max-w-3xl mx-auto space-y-3">
              {filtered.map(c => <CampaignCard key={c.id} campaign={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
