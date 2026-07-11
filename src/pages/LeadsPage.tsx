import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Mail, Phone, MessageSquare, Trash2, Flame, Zap, Layers,
  Sparkles, PhoneCall, PieChart, TrendingUp, ArrowRight,
} from 'lucide-react'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useLeads, useUpdateLeadStatus, useDeleteLead, useLeadStats, useLeadTrends } from '../hooks/useLeads'
import { timeAgo } from '../lib/utils'
import type { LeadStatus, LeadWithCampaign } from '../types/database.types'

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; next: LeadStatus | null; nextLabel: string }> = {
  new:        { label: 'New',       color: 'bg-indigo-tint text-primary',  next: 'contacted', nextLabel: 'Mark Contacted' },
  contacted:  { label: 'Contacted', color: 'bg-orange-tint text-warning',  next: 'qualified', nextLabel: 'Mark Qualified' },
  qualified:  { label: 'Qualified', color: 'bg-success/10 text-success',   next: 'closed',    nextLabel: 'Mark Closed'   },
  closed:     { label: 'Closed',    color: 'bg-surface-container-low text-on-surface-variant', next: null, nextLabel: '' },
}

function tierOf(score: number) { return score >= 70 ? 'hot' : score >= 40 ? 'medium' : 'low' }

function potentialValue(lead: LeadWithCampaign) {
  // Heuristic estimate derived from the AI conversion score, same convention used on the Dashboard.
  return Math.round((lead.score ?? 0) * 1500)
}

function nextBestAction(lead: LeadWithCampaign): { label: string; icon: typeof PhoneCall; tone: 'solid' | 'success' | 'neutral' } {
  const tier = tierOf(lead.score)
  if (tier === 'hot' && lead.phone) return { label: 'Call Now', icon: PhoneCall, tone: 'solid' }
  if (lead.phone) return { label: 'Send WhatsApp', icon: MessageSquare, tone: 'success' }
  if (lead.email) return { label: 'Send Email', icon: Mail, tone: 'success' }
  return { label: 'Nurture Campaign', icon: Zap, tone: 'neutral' }
}

function whyText(lead: LeadWithCampaign) {
  if (lead.recommended_action) return lead.recommended_action
  const parts: string[] = []
  if (lead.time_on_page_seconds) parts.push(`spent ${lead.time_on_page_seconds}s on the landing page`)
  if (lead.scroll_depth_pct) parts.push(`scrolled ${lead.scroll_depth_pct}% of the content`)
  if (lead.click_count) parts.push(`clicked ${lead.click_count} element${lead.click_count > 1 ? 's' : ''}`)
  if (parts.length === 0) return `Signal detected via ${lead.source.replace('_', ' ')} — no additional engagement data captured yet.`
  return `Visitor ${parts.join(', ')}.`
}

// ── Priority tile ─────────────────────────────────────────────────────────────

function PriorityTile({ icon: Icon, iconBg, label, value, sublabel, subTone }: {
  icon: typeof Flame; iconBg: string; label: string; value: number; sublabel: React.ReactNode; subTone: string
}) {
  return (
    <div className="bg-surface-card rounded-2xl border border-border-subtle px-4 py-4 flex items-start justify-between shadow-soft">
      <div>
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-1.5">{label}</p>
        <p className="text-2xl font-bold text-on-surface">{value} Leads</p>
        <p className={`text-xs font-semibold mt-1 flex items-center gap-1 ${subTone}`}>{sublabel}</p>
      </div>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon size={16} className="text-white" />
      </div>
    </div>
  )
}

// ── Priority lead row ────────────────────────────────────────────────────────

const ACTION_BTN: Record<'solid' | 'success' | 'neutral', string> = {
  solid:   'bg-primary text-white hover:opacity-90',
  success: 'bg-transparent text-success border border-success/30 hover:bg-success/10',
  neutral: 'bg-transparent text-on-surface-variant border border-outline-variant hover:bg-surface-container-low',
}

function PriorityLeadCard({ lead }: { lead: LeadWithCampaign }) {
  const { mutate: updateStatus, isPending: updating } = useUpdateLeadStatus()
  const { mutate: deleteLead, isPending: deleting } = useDeleteLead()
  const cfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new
  const tier = tierOf(lead.score)
  const isHot = tier === 'hot'
  const action = nextBestAction(lead)
  const ActionIcon = action.icon

  return (
    <div className={`bg-surface-card rounded-2xl border p-4 shadow-soft ${isHot ? 'border-primary/30 ring-1 ring-primary/10' : 'border-border-subtle'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white ${isHot ? 'bg-primary' : 'bg-secondary'}`}>
          {(lead.name ?? '??').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
            <div>
              <p className="text-sm font-bold text-on-surface">{lead.name ?? '(no name)'}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {lead.campaigns ? <>via <span className="text-on-surface font-medium">{lead.campaigns.campaign_name}</span></> : lead.source.replace('_', ' ')}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-tint text-primary border border-primary/10">
                <Flame size={9} /> Opportunity Score: {lead.score}
              </span>
              <p className="font-mono text-sm font-bold text-success mt-1">${potentialValue(lead).toLocaleString()} Potential</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-3 mb-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">AI Next Best Action</p>
              <button className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-colors ${ACTION_BTN[action.tone]}`}>
                <ActionIcon size={12} /> {action.label}
              </button>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Why?</p>
              <p className="text-xs text-on-surface-variant leading-relaxed">{whyText(lead)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-2">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Mail size={10} />{lead.email}
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary">
                <Phone size={10} />{lead.phone}
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border-subtle">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
            <span className="text-xs text-on-surface-variant">{timeAgo(lead.created_at)}</span>
            <div className="flex items-center gap-1.5 ml-auto">
              {cfg.next && (
                <button
                  onClick={() => updateStatus({ id: lead.id, status: cfg.next! })}
                  disabled={updating}
                  className="text-xs px-2.5 py-1 rounded-lg border border-success/30 text-success hover:bg-success/10 transition-colors font-medium"
                >
                  {cfg.nextLabel}
                </button>
              )}
              <button
                onClick={() => { if (confirm('Delete this lead?')) deleteLead(lead.id) }}
                disabled={deleting}
                className="p-1.5 rounded-lg text-danger/40 hover:bg-red-tint hover:text-danger transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Lead Source Breakdown (real-data substitute for a geo heatmap — no location data is captured on leads yet) ──

function LeadSourceBreakdown({ leads }: { leads: LeadWithCampaign[] }) {
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of leads) counts[l.source] = (counts[l.source] ?? 0) + 1
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, count, pct: leads.length ? Math.round((count / leads.length) * 100) : 0 }))
  }, [leads])

  return (
    <div className="bg-surface-card rounded-2xl border border-border-subtle p-4 shadow-soft">
      <div className="flex items-center gap-2 mb-4">
        <PieChart size={15} className="text-primary" />
        <h3 className="text-sm font-bold text-on-surface">Lead Source Breakdown</h3>
      </div>
      {breakdown.length === 0 ? (
        <p className="text-xs text-on-surface-variant">No leads yet.</p>
      ) : (
        <div className="space-y-3">
          {breakdown.map(({ source, count, pct }) => (
            <div key={source}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-semibold text-on-surface capitalize truncate">{source.replace(/_/g, ' ')}</span>
                <span className="text-xs font-mono font-bold text-primary">{count} · {pct}%</span>
              </div>
              <div className="w-full bg-surface-container-low h-1.5 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, pct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10.5px] text-on-surface-variant mt-4 mb-3">Where your highest-intent leads are originating from, based on all tracked leads.</p>
      <Link
        to="/analytics"
        className="inline-flex items-center justify-center gap-1.5 w-full border border-outline-variant hover:bg-surface-container-low text-on-surface text-xs font-bold py-2.5 rounded-xl transition-colors"
      >
        View Full Report <ArrowRight size={12} />
      </Link>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const [signalFilter, setSignalFilter] = useState<'all' | 'recommended'>('all')
  const { data: leads = [], isLoading } = useLeads()
  const { data: stats } = useLeadStats()
  const { data: trends } = useLeadTrends()

  const visibleLeads = useMemo(() => {
    const sorted = [...leads].sort((a, b) => b.score - a.score)
    return signalFilter === 'recommended' ? sorted.filter(l => tierOf(l.score) === 'hot' || l.recommended_action) : sorted
  }, [leads, signalFilter])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-on-surface mb-1">Leads</h1>
        <p className="text-sm text-on-surface-variant">AI-ranked by conversion potential — highest-intent leads first.</p>
      </div>

      {/* Priority tiles */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PriorityTile
            icon={Flame} iconBg="bg-danger" label="Hot Priority" value={stats.hot}
            sublabel={<><TrendingUp size={11} />{(trends?.hot.changePct ?? 0) >= 0 ? '+' : ''}{trends?.hot.changePct ?? 0}% vs last week</>}
            subTone={(trends?.hot.changePct ?? 0) >= 0 ? 'text-danger' : 'text-on-surface-variant'}
          />
          <PriorityTile
            icon={Zap} iconBg="bg-warning" label="Warm Activity" value={stats.medium}
            sublabel={<><Zap size={11} />{trends?.medium.activeCampaigns ?? 0} active campaign{trends?.medium.activeCampaigns === 1 ? '' : 's'}</>}
            subTone="text-warning"
          />
          <PriorityTile
            icon={Layers} iconBg="bg-secondary" label="Dormant Pool" value={stats.low}
            sublabel={<><Layers size={11} />Re-engagement required</>}
            subTone="text-on-surface-variant"
          />
        </div>
      )}

      {/* Main content */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads yet"
          description="Post a campaign with a landing page — when visitors fill in the form, leads appear here."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-4">
          {/* Priority Intelligence Feed */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                <Sparkles size={14} className="text-primary" /> Priority Intelligence Feed
              </h2>
              <div className="inline-flex rounded-full bg-surface-container-low p-0.5">
                {(['all', 'recommended'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setSignalFilter(v)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      signalFilter === v ? 'bg-primary text-white' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {v === 'all' ? 'All Signals' : 'Recommended'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {visibleLeads.map(l => <PriorityLeadCard key={l.id} lead={l} />)}
            </div>
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            <LeadSourceBreakdown leads={leads} />
          </div>
        </div>
      )}
    </div>
  )
}
