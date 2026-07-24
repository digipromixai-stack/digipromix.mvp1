import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { PageSpinner } from '../components/ui/Spinner'
import { useToast } from '../components/ui/Toast'
import {
  ArrowRight, Sparkles, Zap, Target, Users, AlertTriangle,
  CheckCircle, TrendingUp, Compass, ShieldCheck,
} from 'lucide-react'
import type { Opportunity } from '../types/database.types'
import { useValuePerLead } from '../hooks/useProfile'
import { SourceTag, InfoTooltip, confidenceLevel, confidenceTone, type DataSource } from '../components/ui/MetricMeta'

// ── KPI tile (2x2 cluster) ──────────────────────────────────────────────────

function KpiTile({ label, value, icon: Icon, tone = 'default', source, info }: {
  label: string; value: string | number; icon: typeof Target
  tone?: 'default' | 'primary' | 'success' | 'warning'
  source?: DataSource
  info?: React.ReactNode
}) {
  const valueTone: Record<string, string> = {
    default: 'text-on-surface',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
  }
  const iconTone: Record<string, string> = {
    default: 'bg-surface-container text-on-surface-variant',
    primary: 'bg-primary-container text-on-primary-container',
    success: 'bg-primary-container text-on-primary-container',
    warning: 'bg-orange-tint text-warning',
  }
  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 shadow-soft">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-semibold text-on-surface-variant flex items-center gap-1">
          {label}
          {info && <InfoTooltip title={`How ${label} is calculated`}>{info}</InfoTooltip>}
        </p>
        <span className={`w-[30px] h-[30px] rounded-lg flex items-center justify-center shrink-0 ${iconTone[tone]}`}>
          <Icon size={15} />
        </span>
      </div>
      <p className={`font-display text-[26px] font-semibold leading-none ${valueTone[tone]}`}>{value}</p>
      {source && <SourceTag source={source} className="mt-2.5" />}
    </div>
  )
}

// ── Opportunity score explanation (Priority 5) ──────────────────────────────
// Turns raw signal_sources/metadata into plain-language reasons a customer
// can read: "Promotion detected", "Search demand increased", etc.

export function opportunityScoreReasons(opp: Opportunity): string[] {
  const meta = (opp.metadata ?? {}) as Record<string, unknown>
  const sources = (opp.signal_sources ?? []) as Array<Record<string, unknown>>

  // Preferred: plain-language reasons written by the scoring engine itself
  // (score-opportunities → metadata.score_reasons). Fall back to deriving
  // from raw signals for opportunities scored before that deploy.
  if (Array.isArray(meta.score_reasons) && meta.score_reasons.length > 0) {
    return (meta.score_reasons as unknown[]).filter((r): r is string => typeof r === 'string').slice(0, 5)
  }

  const reasons: string[] = []

  if (meta.source_competitor) reasons.push(`Competitor change detected (${meta.source_competitor})`)
  if (sources.some(s => s.signal_type === 'SEARCH_SPIKE')) {
    const spike = sources.find(s => s.signal_type === 'SEARCH_SPIKE')
    const pct = spike?.growth_pct
    reasons.push(typeof pct === 'number' ? `Search demand increased +${Math.round(pct)}%` : 'Search demand increased')
  }
  if (sources.some(s => s.signal_type === 'AD_VOLUME_SPIKE')) reasons.push('Competitor ad activity increased')
  if (sources.some(s => s.signal_type === 'NEW_CREATIVE')) reasons.push('New competitor ad creative detected')
  if (sources.some(s => s.signal_type === 'OFFER_REPEAT')) reasons.push('Competitor offer is repeating — proven to work')
  if (sources.length > 1) reasons.push(`${sources.length} independent signals corroborate this opportunity`)
  if (reasons.length === 0 && opp.reasoning) reasons.push(opp.reasoning)

  return reasons
}

// ── Business health ring ─────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const r = 42
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - score / 100)
  return (
    <div className="relative w-[112px] h-[112px] shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#EFEDE5" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="#1E8A5C" strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold text-on-surface leading-none">{score}</span>
        <span className="text-[10px] text-on-surface-variant mt-1">/ 100</span>
      </div>
    </div>
  )
}

function HealthBar({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'primary' }) {
  const barColor = { success: 'bg-success', warning: 'bg-warning', primary: 'bg-primary' }[tone]
  return (
    <div>
      <div className="flex justify-between items-center text-xs mb-1">
        <span className="text-on-surface-variant">{label}</span>
        <span className="font-bold text-on-surface">{value}%</span>
      </div>
      <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user, businessId } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const valuePerLead = useValuePerLead()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard_stats_v2', businessId],
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const weekAgo = new Date(Date.now() - 7 * 86400000)
      const [competitors, changesToday, highSeverity7d, changes7d, openOpps, totalLeads, leads7d] = await Promise.all([
        supabase.from('competitors').select('*', { count: 'exact', head: true }).eq('user_id', businessId!).eq('is_active', true),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', businessId!).gte('detected_at', todayStart.toISOString()),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', businessId!).eq('severity', 'high').gte('detected_at', weekAgo.toISOString()),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', businessId!).gte('detected_at', weekAgo.toISOString()),
        supabase.from('opportunities').select('expected_leads').eq('user_id', businessId!).eq('status', 'open'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', businessId!),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', businessId!).gte('created_at', weekAgo.toISOString()),
      ])
      return {
        competitors:   competitors.count   ?? 0,
        changesToday:  changesToday.count   ?? 0,
        highSev7d:     highSeverity7d.count ?? 0,
        total7d:       changes7d.count      ?? 0,
        openOpps:      openOpps.data?.length ?? 0,
        // Sum of AI-estimated leads across all open opportunities — the real
        // basis for the Est. Revenue tile (no per-opportunity guesswork).
        openOppLeads:  (openOpps.data ?? []).reduce((s, o) => s + ((o as { expected_leads: number | null }).expected_leads ?? 0), 0),
        totalLeads:    totalLeads.count     ?? 0,
        leads7d:       leads7d.count        ?? 0,
      }
    },
    enabled: !!businessId,
    refetchInterval: 30000,
  })

  const { data: topOpportunity, dataUpdatedAt } = useQuery({
    queryKey: ['top_opportunity_dashboard', businessId],
    queryFn: async () => {
      const { data } = await supabase
        .from('opportunities')
        .select('*')
        .eq('user_id', businessId!)
        .eq('status', 'open')
        .order('opportunity_score', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as Opportunity | null
    },
    enabled: !!businessId,
    refetchInterval: 60000,
  })

  const seedDemo = useMutation({
    mutationFn: () => supabase.rpc('seed_demo_data', { p_user_id: businessId! }) as unknown as Promise<unknown>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard_stats_v2'] })
      qc.invalidateQueries({ queryKey: ['top_opportunity_dashboard'] })
      toast('Demo data loaded!', 'success', 'Demo Ready')
    },
    onError: () => toast('Failed to load demo data', 'error'),
  })

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ['dashboard_stats_v2'] })
    qc.invalidateQueries({ queryKey: ['top_opportunity_dashboard'] })
    toast('Intelligence refreshed', 'success')
  }

  if (statsLoading) return <PageSpinner />

  const hasData = (stats?.competitors ?? 0) > 0
  const hour = new Date().getHours()
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'
  const greeting = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', ' + firstName

  const openOpps   = stats?.openOpps ?? 0
  const highSev7d  = stats?.highSev7d ?? 0
  const leads7d    = stats?.leads7d ?? 0
  const totalLeads = stats?.totalLeads ?? 0
  const openOppLeads     = stats?.openOppLeads ?? 0
  const potentialRevenue = openOppLeads * valuePerLead // sum of AI-estimated leads across open opportunities × configured lead value

  const threatScore      = Math.max(0, 100 - highSev7d * 15)
  const opportunityScore = Math.min(100, openOpps * 10)
  const leadScore        = Math.min(100, leads7d * 12)
  const healthScore      = Math.round((threatScore + opportunityScore + leadScore) / 3)

  const score      = topOpportunity ? Math.round(topOpportunity.opportunity_score) : 0
  const confLevel  = topOpportunity ? confidenceLevel(topOpportunity.confidence) : null
  const scoreReasons = topOpportunity ? opportunityScoreReasons(topOpportunity) : []
  const expLeads   = topOpportunity?.expected_leads ?? 0
  const oppRevenue = expLeads > 0 ? `$${(expLeads * valuePerLead).toLocaleString()}` : '—'
  // recommended_budget is a DAILY figure (see score-opportunities: expected_leads is derived
  // from recommended_budget × 7 days of spend) — the weekly spend backing expLeads is ×7, not ×4.
  const weeklySpend = topOpportunity?.recommended_budget != null ? topOpportunity.recommended_budget * 7 : 0
  const roi        = expLeads > 0 && weeklySpend > 0 ? (((expLeads * valuePerLead) / weeklySpend)).toFixed(1) : '—'
  const minsAgo    = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 60000))
  // Real derived figures for the "what changed" delta — not fabricated:
  // signals as of yesterday = signals in the last 7 days minus today's signals.
  const signalsTotal     = stats?.total7d ?? 0
  const signalsToday     = stats?.changesToday ?? 0
  const signalsYesterday = Math.max(0, signalsTotal - signalsToday)

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto">

      {/* ── Greeting header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl text-on-surface flex items-center gap-2">
            {greeting} 👋
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Here's what the AI Decision Engine found for you today.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 bg-red-tint px-3 py-1.5 rounded-full border border-danger/20 w-fit">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
          </span>
          <span className="text-danger text-[10px] font-bold uppercase tracking-widest">Live Engine</span>
        </div>
      </div>

      {/* ── Executive summary strip (AI-generated content pattern) ── */}
      <div className="bg-indigo-tint border-l-2 border-secondary rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-3.5 mb-6 shadow-soft">
        <div className="w-[34px] h-[34px] rounded-lg bg-white flex items-center justify-center shrink-0 text-secondary shadow-soft">
          <Sparkles size={16} />
        </div>
        <div className="flex-1">
          <p className="text-[10.5px] uppercase tracking-widest text-secondary font-bold mb-1">Today's Summary</p>
          <p className="text-[14.5px] leading-relaxed text-on-surface max-w-2xl">
            <span className="text-primary font-semibold">{openOpps} strategic {openOpps === 1 ? 'opportunity' : 'opportunities'}</span> detected across your active markets. Intelligence last updated {minsAgo} {minsAgo === 1 ? 'minute' : 'minutes'} ago.
          </p>
        </div>
        <button
          onClick={refreshAll}
          className="sm:ml-auto shrink-0 inline-flex items-center justify-center gap-1.5 bg-primary text-white text-[13px] font-semibold px-3.5 py-2 rounded-lg hover:bg-on-primary-container transition-colors"
        >
          Refresh data
        </button>
      </div>

      {!hasData ? (
        <div className="bg-surface-card border border-border-subtle rounded-xl p-8 text-center shadow-soft">
          <p className="text-on-surface-variant mb-4">Setting up your intelligence feed — add competitors to get started.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => seedDemo.mutate()}
              disabled={seedDemo.isPending}
              className="inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-soft hover:opacity-90"
            >
              <Sparkles size={14} />
              {seedDemo.isPending ? 'Loading…' : 'Load demo data'}
            </button>
            <Link to="/competitors" className="inline-flex items-center justify-center gap-2 bg-white border border-border-subtle text-on-surface text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-surface-container-low">
              Add a competitor
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI row ── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
            <KpiTile
              label="Est. Revenue"
              value={`$${potentialRevenue.toLocaleString()}`}
              icon={Target}
              tone="primary"
              source="estimated"
              info={<>Total AI-estimated leads across your {openOpps} open opportunities ({openOppLeads}) × your configured Value Per Lead (${valuePerLead}, set in Settings). Becomes Actual Revenue once campaigns generate real results.</>}
            />
            {openOppLeads > 0 ? (
              <KpiTile
                label="Est. Leads"
                value={openOppLeads}
                icon={Users}
                source="benchmark"
                info={<>Sum of AI-estimated leads across your {openOpps} open opportunities, from industry benchmark cost-per-click, competitor activity, and search demand. Matches the Est. Revenue tile (leads × ${valuePerLead}). Becomes Actual Leads once campaigns run.</>}
              />
            ) : (
              <KpiTile
                label="Actual Leads"
                value={totalLeads}
                icon={Users}
                source="live"
                info={<>Real leads captured from your landing pages and campaigns — not an estimate.</>}
              />
            )}
            <KpiTile
              label="Opportunities"
              value={openOpps}
              icon={Compass}
              source="ai"
              info={<>Open revenue opportunities detected by the AI scoring engine from competitor changes, Google Trends, and ad-activity signals.</>}
            />
            <KpiTile
              label="Threat Level"
              value={highSev7d > 0 ? (highSev7d >= 3 ? 'High' : 'Medium') : 'Low'}
              icon={AlertTriangle}
              tone={highSev7d > 0 ? 'warning' : 'success'}
              source="ai"
              info={<>Based on high-severity competitor changes detected in the last 7 days ({highSev7d} found). 0 = Low, 1–2 = Medium, 3+ = High.</>}
            />
          </div>

          {/* ── Two-column: Business Health / What changed + Best opportunity ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4 mb-5">

            {/* Left: Business Activity Index */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-soft h-full flex flex-col">
              <h3 className="font-display text-[16.5px] font-semibold text-on-surface mb-1 flex items-center gap-1.5">
                Business Activity Index
                <InfoTooltip title="How the Business Activity Index is calculated">
                  Average of three activity measures: open opportunity volume, competitive calm
                  (fewer high-severity threats = higher), and new-lead volume this week.
                  It measures market activity around your business — not revenue or ROI.
                </InfoTooltip>
              </h3>
              <p className="text-xs text-on-surface-variant mb-5">
                Based on recent activity volume (open opportunities, competitor threats, new leads) — not a performance, revenue, or ROI metric.
              </p>
              <div className="flex-1 flex flex-col sm:flex-row items-center gap-6">
                <HealthRing score={healthScore} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 flex-1 w-full">
                  <HealthBar label="Opportunity Volume" value={opportunityScore} tone="primary" />
                  <HealthBar label="Competitive Calm" value={threatScore} tone={threatScore > 60 ? 'success' : 'warning'} />
                  <HealthBar label="Overall Momentum" value={Math.round((opportunityScore + leadScore) / 2)} tone="primary" />
                  <HealthBar label="Lead Volume" value={leadScore} tone="success" />
                </div>
              </div>
            </div>

            {/* Right: What changed + best opportunity */}
            <div className="flex flex-col gap-4 min-w-0">
              <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-soft">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display text-[14.5px] font-semibold text-on-surface">What changed since yesterday</h3>
                </div>
                <div className="flex items-center gap-3 py-3">
                  <span className="font-display text-[19px] font-semibold text-on-surface">{signalsYesterday}</span>
                  <span className="text-on-surface-variant text-sm">→</span>
                  <span className="font-display text-[19px] font-semibold text-on-surface">{signalsTotal}</span>
                  <span className="ml-auto font-mono text-xs font-semibold text-on-primary-container bg-primary-container px-2 py-0.5 rounded-full">
                    +{signalsToday} signals
                  </span>
                </div>
                <p className="text-[11.5px] text-on-surface-variant border-t border-border-subtle pt-3">
                  {highSev7d > 0
                    ? `${highSev7d} high-threat signal${highSev7d > 1 ? 's' : ''} detected this week — recommend reviewing counter-campaign priorities.`
                    : 'No high-threat signals this week. Competitors are quiet.'}
                </p>
              </div>

              {topOpportunity ? (
                <div className="bg-indigo-tint border-l-2 border-secondary rounded-2xl p-4 shadow-soft">
                  <p className="text-[10.5px] uppercase tracking-widest text-secondary font-bold mb-1.5">Best opportunity today</p>
                  <p className="font-display text-base font-semibold mb-3 leading-snug text-on-surface">{topOpportunity.title}</p>
                  <div className="flex gap-5 mb-4">
                    <div>
                      <span className="font-mono text-[15px] font-semibold block text-on-surface">{oppRevenue}</span>
                      <span className="text-[10.5px] text-on-surface-variant">Est. revenue</span>
                    </div>
                    <div>
                      <span className="font-mono text-[15px] font-semibold block text-on-surface">{expLeads || '—'}</span>
                      <span className="text-[10.5px] text-on-surface-variant">Est. leads</span>
                    </div>
                    <div>
                      <span className="font-mono text-[15px] font-semibold block text-on-surface">{confLevel ?? '—'}</span>
                      <span className="text-[10.5px] text-on-surface-variant">Confidence</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/opportunities')}
                    className="inline-flex items-center gap-1.5 bg-primary text-white px-3.5 py-2 rounded-lg font-semibold text-[13px] w-fit hover:opacity-90 transition-opacity"
                  >
                    <Zap size={14} />
                    Launch counter campaign
                  </button>
                </div>
              ) : (
                <Link
                  to="/opportunities"
                  className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-soft relative overflow-hidden flex flex-col justify-between hover:border-primary/30 transition-colors"
                >
                  <ShieldCheck size={30} className="mb-3 text-primary" />
                  <h4 className="font-display font-semibold mb-1.5 text-on-surface">No urgent opportunities right now</h4>
                  <p className="text-sm text-on-surface-variant mb-4">Competitors are quiet — great time to build your brand.</p>
                  <span className="inline-flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm w-fit">
                    Explore opportunities <ArrowRight size={14} />
                  </span>
                  <span className="absolute -bottom-3 -right-3 w-16 h-16 rounded-full bg-indigo-tint flex items-center justify-center">
                    <Compass size={22} className="text-primary" />
                  </span>
                </Link>
              )}
            </div>
          </div>

          {/* ── AI Recommendation ── */}
          {topOpportunity && (
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-soft">
              <div className="flex items-center mb-4">
                <div>
                  <h3 className="font-display text-[16.5px] font-semibold text-on-surface">AI Recommendation</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">Ranked by expected impact on revenue</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
                <div>
                  <h4 className="font-display text-xl font-semibold text-primary mb-1">{topOpportunity.title}</h4>
                  {topOpportunity.industry && (
                    <p className="text-xs text-on-surface-variant">{topOpportunity.industry}{topOpportunity.location ? ` · ${topOpportunity.location}` : ''}</p>
                  )}
                </div>
                <div className="inline-flex items-center gap-2 bg-primary-container text-on-primary-container px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shrink-0">
                  <Sparkles size={12} />
                  Today's Best Opportunity
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-5 border-y border-border-subtle mb-5">
                <div>
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                    Estimated Revenue
                    <InfoTooltip title="How Estimated Revenue is calculated">
                      Estimated Leads ({expLeads || '—'}) × your configured Value Per Lead (${valuePerLead}).
                      Estimated Leads are based on industry benchmarks, competitor activity, and search demand.
                      Once your campaigns generate real results, this becomes Actual Revenue.
                    </InfoTooltip>
                  </p>
                  <p className="font-mono text-2xl font-bold text-on-surface">{oppRevenue}</p>
                  <SourceTag source="estimated" className="mt-1.5" />
                </div>
                <div>
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                    Confidence
                    <InfoTooltip title="How Confidence is determined">
                      Based on how many independent signals corroborate this opportunity
                      (competitor changes, search demand, ad activity). Shown as High / Medium / Low
                      until enough historical campaign data exists to compute it precisely.
                    </InfoTooltip>
                  </p>
                  <p className={`font-mono text-2xl font-bold ${confLevel ? confidenceTone(confLevel) : 'text-on-surface-variant'}`}>{confLevel ?? '—'}</p>
                  <SourceTag source="ai" className="mt-1.5" />
                </div>
                <div>
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                    Opportunity Score
                    <InfoTooltip title="How the Opportunity Score is calculated">
                      A 0–100 ranking combining competitor activity, search demand, signal strength,
                      and how recent the signals are. Higher = act sooner.
                    </InfoTooltip>
                  </p>
                  <p className="font-mono text-2xl font-bold text-on-surface">{score}</p>
                  <SourceTag source="ai" className="mt-1.5" />
                </div>
                <div>
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                    Estimated ROI
                    <InfoTooltip title="How Estimated ROI is calculated">
                      (Estimated Leads × Value Per Lead) ÷ estimated weekly ad spend
                      (recommended daily budget × 7). An industry-benchmark projection, not a
                      measured result — it becomes Actual ROI once real campaign data arrives.
                    </InfoTooltip>
                  </p>
                  <p className="font-mono text-2xl font-bold text-primary">{roi === '—' ? '—' : `${roi}x`}</p>
                  <SourceTag source="benchmark" className="mt-1.5" />
                </div>
              </div>

              {(topOpportunity.recommended_action || scoreReasons.length > 0) && (
                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 flex gap-3 mb-5">
                  <TrendingUp size={18} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-on-surface mb-1">Why this score?</p>
                    {topOpportunity.recommended_action && (
                      <p className="text-sm text-on-surface-variant leading-relaxed mb-2">{topOpportunity.recommended_action}</p>
                    )}
                    {scoreReasons.length > 0 && (
                      <ul className="space-y-1">
                        {scoreReasons.map((r) => (
                          <li key={r} className="text-sm text-on-surface-variant flex items-start gap-1.5">
                            <CheckCircle size={13} className="text-success shrink-0 mt-0.5" />
                            {r}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate('/opportunities')}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-bold text-sm shadow-soft hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  <Zap size={16} />
                  Launch Counter Campaign
                </button>
                <Link
                  to="/opportunities"
                  className="px-6 border border-outline-variant text-on-surface-variant py-3 rounded-xl font-bold text-sm hover:bg-surface-container-low text-center transition-all"
                >
                  View Details
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
