import { useState } from 'react'
import { Users, Mail, Phone, MessageSquare, Trash2, Star, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useLeads, useUpdateLeadStatus, useDeleteLead, useLeadStats } from '../hooks/useLeads'
import { timeAgo } from '../lib/utils'
import type { LeadStatus, LeadWithCampaign } from '../types/database.types'

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; next: LeadStatus | null; nextLabel: string }> = {
  new:        { label: 'New',        color: 'bg-blue-100 text-blue-700',    next: 'contacted',  nextLabel: 'Mark Contacted' },
  contacted:  { label: 'Contacted',  color: 'bg-yellow-100 text-yellow-700', next: 'qualified', nextLabel: 'Mark Qualified' },
  qualified:  { label: 'Qualified',  color: 'bg-green-100 text-green-700',  next: 'closed',     nextLabel: 'Mark Closed'   },
  closed:     { label: 'Closed',     color: 'bg-gray-100 text-gray-600',    next: null,         nextLabel: ''              },
}

function ScoreDot({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-1">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-500 font-mono">{score}%</span>
    </div>
  )
}

function LeadCard({ lead }: { lead: LeadWithCampaign }) {
  const { mutate: updateStatus, isPending: updating } = useUpdateLeadStatus()
  const { mutate: deleteLead, isPending: deleting } = useDeleteLead()
  const cfg = STATUS_CONFIG[lead.status]
  const originUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
            <Users size={16} className="text-blue-500" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-gray-900">{lead.name ?? '(no name)'}</p>
                {lead.campaigns && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Campaign: <span className="text-gray-600 font-medium">{lead.campaigns.campaign_name}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ScoreDot score={lead.score} />
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.color}`}>
                  {cfg.label}
                </span>
              </div>
            </div>

            {/* Contact info */}
            <div className="flex flex-wrap gap-3 mt-2">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <Mail size={11} />{lead.email}
                </a>
              )}
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600">
                  <Phone size={11} />{lead.phone}
                </a>
              )}
            </div>

            {lead.message && (
              <p className="flex items-start gap-1 text-xs text-gray-500 mt-1.5 italic">
                <MessageSquare size={11} className="shrink-0 mt-0.5" />
                {lead.message}
              </p>
            )}

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-gray-400">{timeAgo(lead.created_at)}</span>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs text-gray-400 capitalize">{lead.source.replace('_', ' ')}</span>

              <div className="flex items-center gap-1.5 ml-auto">
                {cfg.next && (
                  <button
                    onClick={() => updateStatus({ id: lead.id, status: cfg.next! })}
                    disabled={updating}
                    className="text-xs px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition-colors"
                  >
                    {cfg.nextLabel}
                  </button>
                )}
                <button
                  onClick={() => { if (confirm('Delete this lead?')) deleteLead(lead.id) }}
                  disabled={deleting}
                  className="text-xs p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function LeadsPage() {
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
  const { data: leads = [], isLoading } = useLeads(filter !== 'all' ? filter : undefined)
  const { data: stats } = useLeadStats()

  const TABS: Array<{ value: LeadStatus | 'all'; label: string }> = [
    { value: 'all',       label: `All (${stats?.total ?? 0})`         },
    { value: 'new',       label: `New (${stats?.new ?? 0})`           },
    { value: 'contacted', label: `Contacted (${stats?.contacted ?? 0})`},
    { value: 'qualified', label: `Qualified (${stats?.qualified ?? 0})`},
    { value: 'closed',    label: `Closed (${stats?.closed ?? 0})`     },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">Captured from your campaign landing pages</p>
        </div>
      </div>

      {/* Stats row */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="py-3">
            <p className="text-xs text-gray-500">Total Leads</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.total}</p>
          </CardContent></Card>
          <Card><CardContent className="py-3">
            <p className="text-xs text-gray-500">Qualified</p>
            <p className="text-2xl font-bold text-green-600 mt-0.5">{stats.qualified}</p>
          </CardContent></Card>
          <Card><CardContent className="py-3">
            <p className="text-xs text-gray-500 flex items-center gap-1"><Star size={11} />Avg Score</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.avgScore}%</p>
          </CardContent></Card>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {label}
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
        <div className="space-y-3">
          {leads.map(l => <LeadCard key={l.id} lead={l} />)}
        </div>
      )}
    </div>
  )
}
