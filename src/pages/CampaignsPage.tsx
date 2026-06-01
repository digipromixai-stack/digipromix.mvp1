import { useState } from 'react'
import {
  Rocket, Search, Globe, Share2, Trash2, Play, Pause,
  CheckCircle2, FileEdit, TrendingUp, Plus, Users, Link2, ExternalLink, Copy,
  AlertTriangle, TrendingDown, ZapOff, DollarSign, Sparkles, RefreshCw,
  Target, Brain, X, Check, ChevronDown, ChevronUp, BarChart2, Pencil,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
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
}> = {
  rising_cpc:       { icon: TrendingUp,   label: 'Rising CPC',        color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200'    },
  declining_ctr:    { icon: TrendingDown, label: 'Declining CTR',     color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-200' },
  conversion_drop:  { icon: Target,       label: 'Conversion Drop',   color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200'    },
  ad_fatigue:       { icon: ZapOff,       label: 'Ad Fatigue',        color: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-200' },
  pause_campaign:   { icon: Pause,        label: 'Pause Suggested',   color: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-200' },
  scale_campaign:   { icon: TrendingUp,   label: 'Scale Up',          color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200'  },
  adjust_budget:    { icon: DollarSign,   label: 'Adjust Budget',     color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'   },
  change_creative:  { icon: Sparkles,     label: 'Refresh Creative',  color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-200' },
  change_audience:  { icon: Users,        label: 'Change Audience',   color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  reactivate:       { icon: RefreshCw,    label: 'Reactivate',        color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200'  },
  launch_campaign:  { icon: Rocket,       label: 'Launch Now',        color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'   },
}

const FALLBACK_META = { icon: Brain, label: 'AI Insight', color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' }

function PriorityBadge({ priority }: { priority: number }) {
  if (priority >= 5) return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700">Urgent</span>
  if (priority >= 4) return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">High</span>
  if (priority >= 3) return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">Medium</span>
  return null
}

function RecommendationCard({ rec }: { rec: AiRecommendationWithCampaign }) {
  const [expanded, setExpanded] = useState(false)
  const { mutate: apply,   isPending: applying   } = useApplyRecommendation()
  const { mutate: dismiss, isPending: dismissing } = useDismissRecommendation()
  const meta = ACTION_META[rec.action_type] ?? FALLBACK_META
  const Icon = meta.icon

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
              {expanded ? (
                <p className="text-xs text-gray-500">{rec.rationale}</p>
              ) : null}
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
            onClick={() => apply(rec.id)}
            disabled={applying || dismissing}
            title="Mark as applied"
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {applying ? '...' : <><Check size={11} /> Apply</>}
          </button>
          <button
            onClick={() => dismiss(rec.id)}
            disabled={applying || dismissing}
            title="Dismiss"
            className="p-1.5 rounded-lg text-gray-400 hover:bg-white hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            {dismissing ? '...' : <X size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}

function AiRecommendationsPanel() {
  const { data: recs = [], isLoading } = useAiRecommendations()
  const [collapsed, setCollapsed] = useState(false)

  if (isLoading || recs.length === 0) return null

  const urgentCount = recs.filter(r => r.priority >= 4).length

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Panel header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Brain size={16} className="text-violet-600" />
          <span className="text-sm font-bold text-gray-900">AI Campaign Insights</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${urgentCount > 0 ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-700'}`}>
            {recs.length} {recs.length === 1 ? 'insight' : 'insights'}{urgentCount > 0 ? ` · ${urgentCount} urgent` : ''}
          </span>
        </div>
        {collapsed ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronUp size={15} className="text-gray-400" />}
      </button>

      {/* Recommendation list */}
      {!collapsed && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400">
            Generated by DigiPromix AI from your live campaign metrics. Dismiss to hide, Apply to mark done.
          </p>
          {recs.map(rec => <RecommendationCard key={rec.id} rec={rec} />)}
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

  const save = () => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 1) return
    updateBudget({ id: campaign.id, daily_budget: n }, {
      onSuccess: () => setEditing(false),
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
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="py-4">
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
      </CardContent>
    </Card>
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
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI-generated counter-campaigns from competitor moves</p>
        </div>
        <Link to="/dashboard">
          <Button size="sm">
            <Plus size={14} className="mr-1.5" />
            New from signal
          </Button>
        </Link>
      </div>

      {/* Stats */}
      {!isLoading && campaigns.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total', value: stats.total,  icon: TrendingUp,  color: 'text-gray-700'  },
            { label: 'Active', value: stats.active, icon: Play,        color: 'text-green-600' },
            { label: 'Drafts', value: stats.draft,  icon: FileEdit,    color: 'text-gray-400'  },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <Icon size={15} className={color} />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
              </CardContent>
            </Card>
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
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                filter === s
                  ? 'bg-blue-600 text-white'
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
