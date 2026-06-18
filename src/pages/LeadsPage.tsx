import { useState } from 'react'
import { Users, Mail, Phone, MessageSquare, Trash2, Star, Flame, Snowflake, Activity, Brain, TrendingUp, CheckCircle2 } from 'lucide-react'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useLeads, useUpdateLeadStatus, useDeleteLead, useLeadStats } from '../hooks/useLeads'
import { timeAgo } from '../lib/utils'
import type { LeadStatus, LeadWithCampaign } from '../types/database.types'

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; next: LeadStatus | null; nextLabel: string }> = {
  new:        { label: 'New',        color: 'bg-blue-100 text-blue-700',     next: 'contacted', nextLabel: 'Mark Contacted' },
  contacted:  { label: 'Contacted',  color: 'bg-amber-100 text-amber-700',   next: 'qualified', nextLabel: 'Mark Qualified' },
  qualified:  { label: 'Qualified',  color: 'bg-green-100 text-green-700',   next: 'closed',    nextLabel: 'Mark Closed'   },
  closed:     { label: 'Closed',     color: 'bg-gray-100 text-gray-600',     next: null,        nextLabel: ''              },
}

function IntentBadge({ scoreType }: { scoreType: string | null | undefined }) {
  if (!scoreType) return null
  const key = scoreType.toUpperCase()
  const variants: Record<string, { Icon: typeof Flame; label: string; cls: string }> = {
    HOT:    { Icon: Flame,     label: '🔥 HOT',  cls: 'bg-red-50 text-red-700 border-red-200'      },
    MEDIUM: { Icon: Activity,  label: '⚡ WARM', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    LOW:    { Icon: Snowflake, label: '❄ COLD', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  }
  const v = variants[key] ?? variants.LOW
  const { Icon } = v
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${v.cls}`}>
      <Icon size={10} />{v.label}
    </span>
  )
}

function ConversionBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="text-[10px] font-bold text-gray-500 w-7 text-right">{score}%</span>
    </div>
  )
}

function LeadCard({ lead }: { lead: LeadWithCampaign }) {
  const { mutate: updateStatus, isPending: updating } = useUpdateLeadStatus()
  const { mutate: deleteLead, isPending: deleting } = useDeleteLead()
  const cfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new
  const isHot = (lead.intent_level ?? lead.score_type)?.toUpperCase() === 'HOT'

  return (
    <div className={`bg-white rounded-xl border hover:shadow-sm transition-shadow ${isHot ? 'border-red-200 ring-1 ring-red-50' : 'border-gray-200'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isHot ? 'bg-red-50' : 'bg-blue-50'}`}>
            <Users size={15} className={isHot ? 'text-red-500' : 'text-blue-500'} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Top row */}
            <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
              <div>
                <p className="text-sm font-bold text-gray-900">{lead.name ?? '(no name)'}</p>
                {lead.campaigns && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    via <span className="text-gray-600 font-medium">{lead.campaigns.campaign_name}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <IntentBadge scoreType={lead.intent_level ?? lead.score_type} />
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
              </div>
            </div>

            {/* Conversion probability bar */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1">
                  <Brain size={9} /> Conversion prob.
                </span>
              </div>
              <ConversionBar score={lead.score} />
            </div>

            {/* Contact info */}
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

            {lead.message && (
              <p className="flex items-start gap-1 text-xs text-gray-500 mb-2 italic">
                <MessageSquare size={10} className="shrink-0 mt-0.5" />{lead.message}
              </p>
            )}

            {lead.recommended_action && (
              <div className="bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5 mb-2 flex items-start gap-1.5">
                <Brain size={11} className="text-violet-500 shrink-0 mt-0.5" />
                <p className="text-xs text-violet-700 font-medium">{lead.recommended_action}</p>
              </div>
            )}

            {/* Footer row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">{timeAgo(lead.created_at)}</span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-xs text-gray-400 capitalize">{lead.source.replace('_', ' ')}</span>
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
    </div>
  )
}

export function LeadsPage() {
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
  const { data: leads = [], isLoading } = useLeads(filter !== 'all' ? filter : undefined)
  const { data: stats } = useLeadStats()

  const TABS: Array<{ value: LeadStatus | 'all'; label: string; color: string }> = [
    { value: 'all',       label: `All`,       color: 'text-gray-600'  },
    { value: 'new',       label: `New`,       color: 'text-blue-600'  },
    { value: 'contacted', label: `Contacted`, color: 'text-amber-600' },
    { value: 'qualified', label: `Qualified`, color: 'text-green-600' },
    { value: 'closed',    label: `Closed`,    color: 'text-gray-500'  },
  ]

  const conversionRate = stats && stats.total > 0
    ? Math.round((stats.closed ?? 0) / stats.total * 100)
    : 0

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Brain size={15} className="text-violet-500" />
          <span className="text-xs font-bold uppercase tracking-widest text-violet-600">AI Lead Intent Engine</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Potential Customers</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          AI-scored leads ranked by conversion probability
        </p>
      </div>

      {/* Stats */}
      {stats && stats.total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5 flex items-center gap-1"><Users size={12} /> Total</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-green-200 ring-1 ring-green-50 px-4 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5 flex items-center gap-1"><CheckCircle2 size={12} /> Qualified</p>
              <p className="text-2xl font-bold text-green-600">{stats.qualified}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5 flex items-center gap-1"><TrendingUp size={12} /> Conversion</p>
              <p className="text-2xl font-bold text-gray-900">{conversionRate}%</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1.5 flex items-center gap-1"><Star size={12} /> Avg Score</p>
              <p className="text-2xl font-bold text-gray-900">{stats.avgScore}%</p>
            </div>
          </div>

          {/* Intent distribution */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-4 flex-wrap">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Lead Intent:</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
              <Flame size={10} /> HOT: {stats.hot ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">
              <Activity size={10} /> WARM: {stats.medium ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200 text-xs font-bold">
              <Snowflake size={10} /> COLD: {stats.low ?? 0}
            </span>
          </div>
        </>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(({ value, label, color }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === value
                ? 'bg-gray-900 text-white'
                : `bg-gray-100 ${color} hover:bg-gray-200`
            }`}
          >
            {label} {stats && (
              <span className="opacity-70">
                ({value === 'all' ? stats.total : value === 'new' ? stats.new : value === 'contacted' ? stats.contacted : value === 'qualified' ? stats.qualified : stats.closed ?? 0})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filter === 'all' ? 'No leads yet' : `No ${filter} leads`}
          description={
            filter === 'all'
              ? 'Post a campaign with a landing page — when visitors fill in the form, leads appear here.'
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {leads.map(l => <LeadCard key={l.id} lead={l} />)}
        </div>
      )}
    </div>
  )
}
