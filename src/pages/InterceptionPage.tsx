import { useState, useMemo } from 'react'
import { Zap, Users, Rocket, AlertTriangle, ExternalLink, Target, Brain, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { ChangeTypeBadge, SeverityBadge } from '../components/ui/Badge'
import { CampaignModal } from '../components/campaigns/CampaignModal'
import { useDetectedChanges } from '../hooks/useDetectedChanges'
import { useCampaigns } from '../hooks/useCampaigns'
import { useLeadStats } from '../hooks/useLeads'
import { timeAgo } from '../lib/utils'
import type { DetectedChangeWithCompetitor } from '../types/database.types'

function MetricCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={color} />
        <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function SignalCard({
  change,
  hasCampaign,
  onIntercept,
}: {
  change: DetectedChangeWithCompetitor
  hasCampaign: boolean
  onIntercept: (c: DetectedChangeWithCompetitor) => void
}) {
  const severityLeft =
    change.severity === 'high'   ? 'border-l-red-400'    :
    change.severity === 'medium' ? 'border-l-amber-400'  : 'border-l-gray-300'

  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${severityLeft} p-4 hover:shadow-sm transition-shadow`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <SeverityBadge severity={change.severity} />
            <ChangeTypeBadge type={change.change_type} />
            {hasCampaign && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={10} /> Intercepted
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900">{change.title}</p>
          {change.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{change.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 flex-wrap">
            <span className="font-semibold text-gray-600">{change.competitors?.name}</span>
            <span className="text-gray-300">·</span>
            <span>{timeAgo(change.detected_at)}</span>
            {change.monitored_pages?.url && (
              <>
                <span className="text-gray-300">·</span>
                <a href={change.monitored_pages.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-0.5 hover:text-blue-500 capitalize">
                  {change.monitored_pages.page_type} <ExternalLink size={9} />
                </a>
              </>
            )}
          </div>
        </div>
        {!hasCampaign && (
          <button
            onClick={() => onIntercept(change)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Zap size={12} /> Counter
          </button>
        )}
      </div>
    </div>
  )
}

function AIRecommendation({
  change,
  onAct,
}: {
  change: DetectedChangeWithCompetitor
  onAct: () => void
}) {
  return (
    <div className="bg-gradient-to-r from-violet-50 via-indigo-50 to-blue-50 border border-violet-200 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-600 shrink-0 shadow-md">
        <Brain size={22} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-600">AI Counter Action</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            change.severity === 'high' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {change.severity} priority
          </span>
        </div>
        <p className="text-base font-bold text-gray-900 leading-snug">
          {change.competitors?.name} just made a move — launch your counter campaign now
        </p>
        <p className="text-sm text-gray-600 mt-0.5 line-clamp-1">{change.title}</p>
        <p className="text-xs text-violet-600 font-semibold mt-1.5 flex items-center gap-1">
          <Zap size={11} /> AI will auto-select audience, budget &amp; channels — you just approve
        </p>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <button
          onClick={onAct}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-sm flex items-center gap-1.5 whitespace-nowrap"
        >
          <Zap size={14} /> Launch Now
        </button>
      </div>
    </div>
  )
}

export function InterceptionPage() {
  const [interceptTarget, setInterceptTarget] = useState<DetectedChangeWithCompetitor | null>(null)
  const [signalFilter, setSignalFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')

  const { data: changes = [], isLoading: loadingChanges } = useDetectedChanges({ limit: 100 })
  const { data: campaigns = [] } = useCampaigns()
  const { data: leadStats } = useLeadStats()

  const interceptedIds = useMemo(() => new Set(campaigns.map(c => c.change_id).filter(Boolean)), [campaigns])

  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), [])
  const recentChanges = useMemo(() => changes.filter(c => new Date(c.detected_at) >= thirtyDaysAgo), [changes, thirtyDaysAgo])
  const recentCampaigns = useMemo(() => campaigns.filter(c => new Date(c.created_at) >= thirtyDaysAgo), [campaigns, thirtyDaysAgo])
  const interceptScore = recentChanges.length > 0
    ? Math.round((recentCampaigns.length / recentChanges.length) * 100)
    : 0

  const topRecommendation = useMemo(() => {
    const unacted = changes.filter(c => !interceptedIds.has(c.id))
    const high   = unacted.filter(c => c.severity === 'high')
    const medium = unacted.filter(c => c.severity === 'medium')
    return (high[0] ?? medium[0] ?? unacted[0]) ?? null
  }, [changes, interceptedIds])

  const visibleSignals = useMemo(() => {
    const list = signalFilter === 'all' ? changes : changes.filter(c => c.severity === signalFilter)
    return list.slice(0, 50)
  }, [changes, signalFilter])

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Brain size={15} className="text-violet-500" />
          <span className="text-xs font-bold uppercase tracking-widest text-violet-600">AI Counter Campaign Engine</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Counter Campaign</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Spot a competitor move → AI builds your counter campaign → capture their customers.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Competitor moves" value={recentChanges.length}    icon={AlertTriangle} color="text-orange-500" sub="last 30 days" />
        <MetricCard label="Campaigns launched" value={recentCampaigns.length} icon={Rocket}        color="text-blue-500"   sub="last 30 days" />
        <MetricCard label="Response rate"     value={`${interceptScore}%`}   icon={Target}        color={interceptScore >= 50 ? 'text-green-600' : 'text-amber-500'} sub="moves acted on" />
        <MetricCard label="Customers captured" value={leadStats?.total ?? 0} icon={Users}         color="text-green-600"  sub={`${leadStats?.qualified ?? 0} qualified`} />
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
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-gray-500" />
            <h2 className="text-sm font-bold text-gray-900">Competitor Signals</h2>
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'high', 'medium', 'low'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSignalFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
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
          <div className="space-y-2">
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
