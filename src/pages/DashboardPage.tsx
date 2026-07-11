import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { PageSpinner } from '../components/ui/Spinner'
import { useToast } from '../components/ui/Toast'
import {
  ArrowRight, Sparkles, Zap, Target, Users, AlertTriangle,
  CheckCircle, HelpCircle, TrendingUp, Compass, ShieldCheck,
} from 'lucide-react'
import type { Opportunity } from '../types/database.types'

// ── KPI tile (2x2 cluster) ──────────────────────────────────────────────────

function KpiTile({ label, value, icon: Icon, tone = 'default' }: {
  label: string; value: string | number; icon: typeof Target
  tone?: 'default' | 'primary' | 'success' | 'warning'
}) {
  const toneClasses: Record<string, string> = {
    default: 'text-on-surface',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
  }
  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-soft">
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-1.5">
        <Icon size={12} />
        {label}
      </p>
      <p className={`font-mono text-2xl font-bold ${toneClasses[tone]}`}>{value}</p>
    </div>
  )
}

// ── Business health ring ─────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const r = 42
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - score / 100)
  return (
    <div className="relative w-40 h-40 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="#3525cd" strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-on-surface">{score}</span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">/100</span>
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
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard_stats_v2', user?.id],
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const weekAgo = new Date(Date.now() - 7 * 86400000)
      const [competitors, changesToday, highSeverity7d, changes7d, openOpps, totalLeads, leads7d] = await Promise.all([
        supabase.from('competitors').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('is_active', true),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('detected_at', todayStart.toISOString()),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('severity', 'high').gte('detected_at', weekAgo.toISOString()),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('detected_at', weekAgo.toISOString()),
        supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'open'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('created_at', weekAgo.toISOString()),
      ])
      return {
        competitors:   competitors.count   ?? 0,
        changesToday:  changesToday.count   ?? 0,
        highSev7d:     highSeverity7d.count ?? 0,
        total7d:       changes7d.count      ?? 0,
        openOpps:      openOpps.count       ?? 0,
        totalLeads:    totalLeads.count     ?? 0,
        leads7d:       leads7d.count        ?? 0,
      }
    },
    enabled: !!user,
    refetchInterval: 30000,
  })

  const { data: topOpportunity, dataUpdatedAt } = useQuery({
    queryKey: ['top_opportunity_dashboard', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('opportunities')
        .select('*')
        .eq('user_id', user!.id)
        .eq('status', 'open')
        .order('opportunity_score', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as Opportunity | null
    },
    enabled: !!user,
    refetchInterval: 60000,
  })

  const seedDemo = useMutation({
    mutationFn: () => supabase.rpc('seed_demo_data', { p_user_id: user!.id }) as unknown as Promise<unknown>,
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
  const potentialRevenue = openOpps * 300 // conservative estimate per open opportunity

  const threatScore      = Math.max(0, 100 - highSev7d * 15)
  const opportunityScore = Math.min(100, openOpps * 10)
  const leadScore        = Math.min(100, leads7d * 12)
  const healthScore      = Math.round((threatScore + opportunityScore + leadScore) / 3)

  const score      = topOpportunity ? Math.round(topOpportunity.opportunity_score) : 0
  const confidence = topOpportunity ? Math.round((topOpportunity.confidence ?? 0) * 100) : 0
  const expLeads   = topOpportunity?.expected_leads ?? 0
  const oppRevenue = expLeads > 0 ? `$${(expLeads * 80).toLocaleString()}` : '—'
  const estBudget  = topOpportunity ? Math.round((topOpportunity.expected_leads ?? 5) * 4) : 0
  const roi        = expLeads > 0 && estBudget > 0 ? (((expLeads * 80) / estBudget)).toFixed(1) : '—'
  const minsAgo    = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 60000))

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto">

      {/* ── Greeting header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
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

      {/* ── Executive summary bar ── */}
      <div className="bg-indigo-tint border border-primary/20 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 mb-6 shadow-soft">
        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary shrink-0">
          <Sparkles size={18} />
        </div>
        <div className="flex-1">
          <p className="text-on-surface-variant text-sm">
            <span className="font-bold text-primary">{openOpps} Strategic {openOpps === 1 ? 'Opportunity' : 'Opportunities'}</span> detected across your active markets. Intelligence last updated {minsAgo} {minsAgo === 1 ? 'minute' : 'minutes'} ago.
          </p>
        </div>
        <button onClick={refreshAll} className="text-primary font-bold text-sm hover:underline shrink-0 text-left sm:text-right">
          Refresh Data
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
        /* ── Bento grid ── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* Left column */}
          <div className="lg:col-span-8 flex flex-col gap-5 min-w-0">

            {topOpportunity ? (
              <div className="bg-surface-card border border-border-subtle rounded-xl p-6 shadow-soft relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-xl font-bold text-primary mb-1">{topOpportunity.title}</h2>
                    {topOpportunity.industry && (
                      <p className="text-xs text-on-surface-variant">{topOpportunity.industry}{topOpportunity.location ? ` · ${topOpportunity.location}` : ''}</p>
                    )}
                  </div>
                  <div className="inline-flex items-center gap-2 bg-indigo-tint text-primary px-3 py-1.5 rounded-full border border-primary/10 text-[10px] font-bold uppercase tracking-widest shrink-0">
                    <Sparkles size={12} />
                    Today's Best Opportunity
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-5 border-y border-border-subtle mb-5">
                  <div>
                    <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1">Potential Revenue</p>
                    <p className="font-mono text-2xl font-bold text-on-surface">{oppRevenue}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1">Confidence</p>
                    <div className="flex items-center gap-1.5">
                      <p className="font-mono text-2xl font-bold text-success">{confidence}%</p>
                      <HelpCircle size={16} className="text-success/60" />
                    </div>
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1">AI Score</p>
                    <p className="font-mono text-2xl font-bold text-on-surface">{score}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1">Expected ROI</p>
                    <p className="font-mono text-2xl font-bold text-primary">{roi === '—' ? '—' : `${roi}x`}</p>
                  </div>
                </div>

                {topOpportunity.recommended_action && (
                  <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 flex gap-3 mb-5">
                    <TrendingUp size={18} className="text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-sm text-on-surface mb-1">Why this is recommended?</p>
                      <p className="text-sm text-on-surface-variant leading-relaxed">{topOpportunity.recommended_action}</p>
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
            ) : (
              <div className="bg-surface-card border border-border-subtle rounded-xl p-6 shadow-soft flex items-center gap-4">
                <CheckCircle size={22} className="text-success shrink-0" />
                <div>
                  <p className="font-bold text-on-surface text-sm">No urgent opportunities right now</p>
                  <p className="text-xs text-on-surface-variant mt-1">Competitors are quiet — great time to build your brand.</p>
                </div>
              </div>
            )}

            {/* Delta panel */}
            <div className="bg-surface-card border border-border-subtle rounded-xl p-6 shadow-soft">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-on-surface">What Changed Since Yesterday</h3>
                <span className="text-xs text-on-surface-variant">Last 24 Hours</span>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-12 h-12 bg-success/10 rounded-2xl flex items-center justify-center text-success">
                    <TrendingUp size={22} />
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest">Signals Today</p>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-bold text-on-surface">{stats?.total7d ?? 0}</span>
                      <span className="text-success font-bold text-sm">+{stats?.changesToday ?? 0}</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 p-3 bg-indigo-tint rounded-xl border border-primary/10 w-full">
                  <p className="text-sm italic text-on-surface-variant">
                    {highSev7d > 0
                      ? `${highSev7d} high-threat signal${highSev7d > 1 ? 's' : ''} detected this week — recommend reviewing counter-campaign priorities.`
                      : 'No high-threat signals this week. Competitors are quiet.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-4 flex flex-col gap-5 min-w-0">

            <div className="grid grid-cols-2 gap-3">
              <KpiTile label="Potential Rev." value={`$${potentialRevenue.toLocaleString()}`} icon={Target} tone="primary" />
              <KpiTile label="Expected Leads" value={expLeads || totalLeads} icon={Users} />
              <KpiTile label="Opportunities" value={openOpps} icon={Compass} />
              <KpiTile
                label="Threat Level"
                value={highSev7d > 0 ? (highSev7d >= 3 ? 'High' : 'Medium') : 'Low'}
                icon={AlertTriangle}
                tone={highSev7d > 0 ? 'warning' : 'success'}
              />
            </div>

            <div className="bg-surface-card border border-border-subtle rounded-xl p-6 shadow-soft">
              <h3 className="font-bold text-on-surface mb-5">Business Health Score</h3>
              <HealthRing score={healthScore} />
              <div className="mt-6 space-y-3">
                <HealthBar label="Marketing Efficiency" value={opportunityScore} tone="primary" />
                <HealthBar label="Competition Index" value={threatScore} tone={threatScore > 60 ? 'success' : 'warning'} />
                <HealthBar label="Campaign Quality" value={Math.round((opportunityScore + leadScore) / 2)} tone="primary" />
                <HealthBar label="Lead Conversion" value={leadScore} tone="success" />
              </div>
            </div>

            <Link
              to="/opportunities"
              className="bg-on-surface text-white rounded-xl p-6 shadow-soft relative overflow-hidden flex flex-col justify-between hover:opacity-95 transition-opacity"
            >
              <ShieldCheck size={36} className="mb-4 opacity-90" />
              <h4 className="font-bold mb-2">Unlock Growth</h4>
              <p className="text-sm text-white/70 mb-4">The AI detected new opportunities in your market. Ready to explore?</p>
              <span className="inline-flex items-center gap-1.5 bg-white text-on-surface px-4 py-2 rounded-lg font-bold text-sm w-fit">
                Explore Now <ArrowRight size={14} />
              </span>
              <span className="absolute -bottom-3 -right-3 w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                <Compass size={22} className="text-white/70" />
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
