import { useMemo, useState } from 'react'
import { Users, Mail, Phone, MessageSquare, Trash2, Flame, Zap, Layers, Brain, PhoneCall, PieChart } from 'lucide-react'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useLeads, useUpdateLeadStatus, useDeleteLead, useLeadStats, useLeadTrends } from '../hooks/useLeads'
import { timeAgo } from '../lib/utils'
import type { LeadStatus, LeadWithCampaign } from '../types/database.types'

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; next: LeadStatus | null; nextLabel: string }> = {
  new:        { label: 'New',        color: 'bg-blue-100 text-blue-700',     next: 'contacted', nextLabel: 'Mark Contacted' },
  contacted:  { label: 'Contacted',  color: 'bg-amber-100 text-amber-700',   next: 'qualified', nextLabel: 'Mark Qualified' },
  qualified:  { label: 'Qualified',  color: 'bg-green-100 text-green-700',   next: 'closed',    nextLabel: 'Mark Closed'   },
  closed:     { label: 'Closed',     color: 'bg-gray-100 text-gray-600',     next: null,        nextLabel: ''              },
}

function tierOf(score: number) { return score >= 70 ? 'hot' : score >= 40 ? 'medium' : 'low' }

function potentialValue(lead: LeadWithCampaign) {
  // Heuristic estimate derived from the AI conversion score, same convention used on the Dashboard.
  return Math.round((lead.score ?? 0) * 1500)
}

function nextBestAction(lead: LeadWithCampaign): { label: string; icon: typeof PhoneCall } {
  const tier = tierOf(lead.score)
  if (tier === 'hot' && lead.phone) return { label: 'Call Now', icon: PhoneCall }
  if (lead.phone) return { label: 'Send WhatsApp', icon: MessageSquare }
  if (lead.email) return { label: 'Send Email', icon: Mail }
  return { label: 'Nurture Campaign', icon: Zap }
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

// ── Stat tile ─────────────────────────────────────────────────────────────────

function PriorityTile({ icon: Icon, iconTone, label, value, sublabel, subTone }: {
  icon: typeof Flame; iconTone: string; label: string; value: number; sublabel: string; subTone: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 flex items-start justify-between" style={{ boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value} Leads</p>
        <p className={`text-xs font-semibold mt-1 ${subTone}`}>{sublabel}</p>
      </div>
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: iconTone }}>
        <Icon size={16} className="text-white" />
      </div>
    </div>
  )
}

// ── Priority lead row ────────────────────────────────────────────────────────

function PriorityLeadCard({ lead }: { lead: LeadWithCampaign }) {
  const { mutate: updateStatus, isPending: updating } = useUpdateLeadStatus()
  const { mutate: deleteLead, isPending: deleting } = useDeleteLead()
  const cfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new
  const tier = tierOf(lead.score)
  const isHot = tier === 'hot'
  const action = nextBestAction(lead)
  const ActionIcon = action.icon

  return (
    <div className={`bg-white rounded-xl border ${isHot ? 'border-blue-200 ring-1 ring-blue-50' : 'border-gray-200'} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white ${isHot ? 'bg-blue-600' : 'bg-gray-400'}`}>
          {(lead.name ?? '??').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
            <div>
              <p className="text-sm font-bold text-gray-900">{lead.name ?? '(no name)'}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {lead.campaigns ? <>via <span className="text-gray-600 font-medium">{lead.campaigns.campaign_name}</span></> : lead.source.replace('_', ' ')}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-primary border border-primary/10">
                <Brain size={9} /> Opportunity Score: {lead.score}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
            </div>
          </div>

          <p className="font-mono text-lg font-bold text-emerald-600 mb-3">${potentialValue(lead).toLocaleString()} Potential</p>

          <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-3 mb-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">AI Next Best Action</p>
              <button className="inline-flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-2 rounded-lg hover:opacity-90">
                <ActionIcon size={12} /> {action.label}
              </button>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Why?</p>
              <p className="text-xs text-gray-600 leading-relaxed">{whyText(lead)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-2">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <Mail size={10} />{lead.email}
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600">
                <Phone size={10} />{lead.phone}
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-400">{timeAgo(lead.created_at)}</span>
            <div className="flex items-center gap-1.5 ml-auto">
              {cfg.next && (
                <button
                  onClick={() => updateStatus({ id: lead.id, status: cfg.next! })}
                  disabled={updating}
                  className="text-xs px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition-colors font-medium"
                >
                  {cfg.nextLabel}
                </button>
              )}
              <button
                onClick={() => { if (confirm('Delete this lead?')) deleteLead(lead.id) }}
                disabled={deleting}
                className="p-1.5 rounded-lg text-red-300 hover:bg-red-50 hover:text-red-500 transition-colors"
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

// ── Lead Source Breakdown (real-data substitute for the geo heatmap) ────────

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
    <div className="bg-white rounded-xl border border-gray-200 p-4" style={{ boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div className="flex items-center gap-2 mb-4">
        <PieChart size={15} className="text-gray-400" />
        <h3 className="text-sm font-bold text-gray-900">Lead Source Breakdown</h3>
      </div>
      {breakdown.length === 0 ? (
        <p className="text-xs text-gray-400">No leads yet.</p>
      ) : (
        <div className="space-y-3">
          {breakdown.map(({ source, count, pct }) => (
            <div key={source}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-semibold text-gray-700 capitalize truncate">{source.replace(/_/g, ' ')}</span>
                <span className="text-xs font-mono font-bold text-primary">{count} · {pct}%</span>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, pct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10.5px] text-gray-400 mt-4">Where your highest-intent leads are originating from, based on all tracked leads.</p>
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
    <div className="space-y-5">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Brain size={15} className="text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest text-primary">AI-Powered Engine</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Leads</h1>
      </div>

      {/* Priority tiles */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PriorityTile
            icon={Flame} iconTone="#e5484d" label="Hot Priority" value={stats.hot}
            sublabel={`${(trends?.hot.changePct ?? 0) >= 0 ? '+' : ''}${trends?.hot.changePct ?? 0}% vs last week`}
            subTone={(trends?.hot.changePct ?? 0) >= 0 ? 'text-red-500' : 'text-gray-400'}
          />
          <PriorityTile
            icon={Zap} iconTone="#d9920a" label="Warm Activity" value={stats.medium}
            sublabel={`${trends?.medium.activeCampaigns ?? 0} active campaign${trends?.medium.activeCampaigns === 1 ? '' : 's'}`}
            subTone="text-amber-600"
          />
          <PriorityTile
            icon={Layers} iconTone="#585f6c" label="Dormant Pool" value={stats.low}
            sublabel="Re-engagement required"
            subTone="text-gray-500"
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
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Zap size={14} className="text-primary" /> Priority Intelligence Feed
              </h2>
              <div className="inline-flex rounded-full bg-gray-100 p-0.5">
                {(['all', 'recommended'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setSignalFilter(v)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      signalFilter === v ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-700'
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
