import { useState } from 'react'
import {
  Rocket, Search, Globe, Share2, Trash2, Play, Pause,
  CheckCircle2, FileEdit, TrendingUp, Plus,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { useCampaigns, useUpdateCampaignStatus, useDeleteCampaign } from '../hooks/useCampaigns'
import { timeAgo } from '../lib/utils'
import type { Campaign, CampaignStatus } from '../types/database.types'

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'bg-gray-100 text-gray-600',   icon: FileEdit     },
  active:    { label: 'Active',    color: 'bg-green-100 text-green-700', icon: Play         },
  paused:    { label: 'Paused',    color: 'bg-yellow-100 text-yellow-700', icon: Pause      },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-700',   icon: CheckCircle2 },
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  google:    Search,
  meta:      Globe,
  instagram: Share2,
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateCampaignStatus()
  const { mutate: deleteCampaign, isPending: deleting } = useDeleteCampaign()

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

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {/* Channels */}
              {campaign.channels.length > 0 && (
                <div className="flex items-center gap-1">
                  {campaign.channels.map(ch => {
                    const Icon = CHANNEL_ICONS[ch] ?? Globe
                    return <Icon key={ch} size={13} className="text-gray-400" />
                  })}
                </div>
              )}
              <span className="text-xs text-gray-400">{timeAgo(campaign.created_at)}</span>

              {/* Actions */}
              <div className="flex items-center gap-1.5 ml-auto">
                {campaign.status === 'active' && (
                  <button
                    onClick={() => updateStatus({ id: campaign.id, status: 'paused' })}
                    disabled={updatingStatus}
                    className="text-xs px-2.5 py-1 rounded-lg border border-yellow-200 text-yellow-700 hover:bg-yellow-50 transition-colors"
                  >
                    Pause
                  </button>
                )}
                {(campaign.status === 'draft' || campaign.status === 'paused') && (
                  <button
                    onClick={() => updateStatus({ id: campaign.id, status: 'active' })}
                    disabled={updatingStatus}
                    className="text-xs px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition-colors"
                  >
                    {campaign.status === 'draft' ? 'Activate' : 'Resume'}
                  </button>
                )}
                {campaign.status === 'active' && (
                  <button
                    onClick={() => updateStatus({ id: campaign.id, status: 'completed' })}
                    disabled={updatingStatus}
                    className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                  >
                    Complete
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm('Delete this campaign?')) deleteCampaign(campaign.id)
                  }}
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
