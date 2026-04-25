/**
 * Live Demand Interception Engine Dashboard
 * Shows competitor signals, metrics, AI recommendation, and active campaigns.
 */
import { useState, useMemo } from 'react'
import { Zap, TrendingUp, Users, Rocket, AlertTriangle, ExternalLink, Percent, Target } from 'lucide-react'
import { Card, CardContent, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { ChangeTypeBadge, SeverityBadge } from '../components/ui/Badge'
import { CampaignModal } from '../components/campaigns/CampaignModal'
import { useDetectedChanges } from '../hooks/useDetectedChanges'
import { useCampaigns } from '../hooks/useCampaigns'
import { useLeadStats } from '../hooks/useLeads'
import { timeAgo } from '../lib/utils'
import type { DetectedChangeWithCompetitor } from '../types/database.types'

// ── Metrics helpers ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon size={15} className={color} />
          <span className="text-xs text-gray-500">{label}</span>
        </div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ── Signal card ────────────────────────────────────────────────────────────────

function SignalCard({
  change,
  hasCampaign,
  onIntercept,
}: {
  change: DetectedChangeWithCompetitor
  hasCampaign: boolean
  onIntercept: (c: DetectedChangeWithCompetitor) => void
}) {
  const severityBorder =
    change.severity === 'high'   ? 'border-l-red-400'    :
    change.severity === 'medium' ? 'border-l-yellow-400' : 'border-l-gray-300'

  return (
    <div className={`bg-white rounded-xl border border-gray-100 border-l-4 ${severityBorder} p-4 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <SeverityBadge severity={change.severity} />
            <ChangeTypeBadge changeType={change.change_type} />
            {hasCampaign && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                ✓ Intercepted
              </span>
            )}
          </div>

          <p className="text-sm font-semibold text-gray-900 mt-1">{change.title}</p>
          {change.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{change.description}</p>
          )}

          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 flex-wrap">
            <span className="font-medium text-gray-600">{change.competitors?.name}</span>
            <span>·</span>
            <span>{timeAgo(change.detected_at)}</span>
            {change.monitored_pages?.url && (
              <>
                <span>·</span>
                <a
                  href={change.monitored_pages.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-0.5 hover:text-blue-500"
                >
                  {change.monitored_pages.page_type}
                  <ExternalLink size={10} />
                </a>
              </>
            )}
          </div>
        </div>

        {!hasCampaign && (
          <Button
            size="sm"
            onClick={() => onIntercept(change)}
            className="shrink-0 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 border-0 text-white shadow"
          >
            <Zap size={13} className="mr-1" />
            Intercept
          </Button>
        )}
      </div>
    </div>
  )
}

// ── AI Recommendation ──────────────────────────────────────────────────────────

function AIRecommendation({
  change,
  onAct,
}: {
  change: DetectedChangeWithCompetitor
  onAct: () => void
}) {
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <Target size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">AI Recommendation</p>
          <p className="text-sm font-semibold text-gray-900">
            {change.competitors?.name} just made a <span className="text-red-600">{change.severity}-priority</span> move
          </p>
          <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{change.title}</p>
          <p className="text-xs text-indigo-600 mt-1.5 font-medium">
            → Launch an interception campaign now while demand is hot
          </p>
        </div>
        <Button size="sm" onClick={onAct} className="shrink-0">
          <Zap size={12} className="mr-1" />Act Now
        </Button>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function InterceptionPage() {
  const [interceptTarget, setInterceptTarget] = useState<DetectedChangeWithCompetitor | null>(null)
  const [signalFilter, setSignalFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')

  const { data: changes = [], isLoading: loadingChanges } = useDetectedChanges({ limit: 100 })
  const { data: campaigns = [] } = useCampaigns()
  const { data: leadStats } = useLeadStats()

  // Set of change_ids that already have a campaign
  const interceptedIds = useMemo(() => new Set(campaigns.map(c => c.change_id).filter(Boolean)), [campaigns])

  // 30-day window stats
  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), [])
  const recentChanges = useMemo(() => changes.filter(c => new Date(c.detected_at) >= thirtyDaysAgo), [changes, thirtyDaysAgo])
  const recentCampaigns = useMemo(() => campaigns.filter(c => new Date(c.created_at) >= thirtyDaysAgo), [campaigns, thirtyDaysAgo])
  const interceptScore = recentChanges.length > 0
    ? Math.round((recentCampaigns.length / recentChanges.length) * 100)
    : 0

  // Top recommendation: highest-severity unacted change
  const topRecommendation = useMemo(() => {
    const unacted = changes.filter(c => !interceptedIds.has(c.id))
    const high   = unacted.filter(c => c.severity === 'high')
    const medium = unacted.filter(c => c.severity === 'medium')
    return (high[0] ?? medium[0] ?? unacted[0]) ?? null
  }, [changes, interceptedIds])

  // Filtered signal list
  const visibleSignals = useMemo(() => {
    const list = signalFilter === 'all' ? changes : changes.filter(c => c.severity === signalFilter)
    return list.slice(0, 50)
  }, [changes, signalFilter])

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Zap size={20} className="text-orange-500" />
          <h1 className="text-xl font-bold text-gray-900">Interception Engine</h1>
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold ml-1">LIVE</span>
        </div>
        <p className="text-sm text-gray-500">
          Detect competitor moves → launch counter-campaigns → capture leads before they do.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Signals (30d)"    value={recentChanges.length}          icon={AlertTriangle} color="text-orange-500" sub="competitor events" />
        <MetricCard label="Campaigns (30d)"  value={recentCampaigns.length}        icon={Rocket}        color="text-blue-500"   sub="launched" />
        <MetricCard label="Intercept Score"  value={`${interceptScore}%`}          icon={Percent}       color={interceptScore >= 50 ? 'text-green-600' : 'text-yellow-500'} sub="signals acted on" />
        <MetricCard label="Total Leads"      value={leadStats?.total ?? 0}         icon={Users}         color="text-green-600"  sub={`${leadStats?.qualified ?? 0} qualified`} />
      </div>

      {/* AI Recommendation */}
      {topRecommendation && (
        <AIRecommendation
          change={topRecommendation}
          onAct={() => setInterceptTarget(topRecommendation)}
        />
      )}

      {/* Signal feed */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-700">🔥 Live Signals</h2>
          <div className="flex gap-1.5">
            {(['all', 'high', 'medium', 'low'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSignalFilter(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  signalFilter === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {loadingChanges ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : visibleSignals.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No signals yet"
            description="Add competitors and monitor their pages — when they make a move, it appears here."
          />
        ) : (
          <div className="space-y-3">
            {visibleSignals.map(change => (
              <SignalCard
                key={change.id}
                change={change}
                hasCampaign={interceptedIds.has(change.id)}
                onIntercept={setInterceptTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* Intercept modal */}
      {interceptTarget && (
        <CampaignModal
          change={interceptTarget}
          open={true}
          onClose={() => setInterceptTarget(null)}
        />
      )}
    </div>
  )
}
