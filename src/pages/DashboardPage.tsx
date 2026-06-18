import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { PageSpinner } from '../components/ui/Spinner'
import { timeAgo } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import { CampaignModal } from '../components/campaigns/CampaignModal'
import { ArrowRight, Sparkles, Zap, Rocket } from 'lucide-react'
import type { DetectedChangeWithCompetitor, Campaign, Competitor } from '../types/database.types'

// ── Design tokens ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#3b6fb5','#9a4f96','#c2683a','#2f8f7d',
  '#5b6477','#c43d3d','#2563eb','#1f9d5b',
]
function avatarColor(name = '') {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 65) % AVATAR_COLORS.length]
}
function getInitial(name = '') { return (name[0] ?? '?').toUpperCase() }

const SEV_META: Record<string, { color: string; bg: string; label: string; ctaBg: string }> = {
  high:   { color: '#e5484d', bg: '#fdeceb', label: 'HIGH THREAT',  ctaBg: '#e5484d' },
  medium: { color: '#d9920a', bg: '#fdf3e3', label: 'MEDIUM',       ctaBg: '#d9920a' },
  low:    { color: '#1f9d5b', bg: '#e9f7ef', label: 'LOW',          ctaBg: '#1f9d5b' },
}

const TYPE_META: Record<string, { color: string; bg: string; label: string }> = {
  promotion:        { color: '#a83278', bg: '#fcebf4', label: 'Promotion' },
  price_change:     { color: '#c2683a', bg: '#fbf0e8', label: 'Price Change' },
  campaign_launch:  { color: '#c43d3d', bg: '#fdeceb', label: 'Campaign Launch' },
  new_landing_page: { color: '#2563eb', bg: '#eaf1fe', label: 'New Landing Page' },
  banner_change:    { color: '#7c5cd1', bg: '#f1ecfb', label: 'Banner Change' },
  content_change:   { color: '#667085', bg: '#f2f4f7', label: 'Content Change' },
}

// ── Threat meter ──────────────────────────────────────────────────────────────

function threatLevel(highCount: number, totalCount: number) {
  const ratio = totalCount > 0 ? highCount / totalCount : 0
  if (highCount >= 6 || ratio > 0.5)  return { label: 'High',     score: 88, color: '#e5484d', bars: 5 }
  if (highCount >= 3 || ratio > 0.25) return { label: 'Elevated', score: 72, color: '#f5a524', bars: 4 }
  if (highCount >= 1 || ratio > 0.1)  return { label: 'Moderate', score: 45, color: '#6d8bff', bars: 3 }
  return                                      { label: 'Low',      score: 18, color: '#1f9d5b', bars: 1 }
}

function ThreatMeter({ highCount, totalCount, factors }: {
  highCount: number; totalCount: number; factors: { label: string; color: string }[]
}) {
  const threat = threatLevel(highCount, totalCount)
  const barColors = Array.from({ length: 5 }, (_, i) => i < threat.bars ? threat.color : 'rgba(255,255,255,.12)')

  return (
    <div style={{ width: 300, flexShrink: 0, background: 'linear-gradient(160deg,#12182a,#0d1322)', padding: '26px', borderLeft: '1px solid rgba(255,255,255,.07)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7a869c', marginBottom: 14 }}>Market threat level</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em', color: threat.color, lineHeight: 1 }}>{threat.label}</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: threat.color }}>{threat.score}</span>
      </div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 20 }}>
        {barColors.map((c, i) => (
          <span key={i} style={{ flex: 1, height: 8, borderRadius: 3, background: c }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {factors.map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: '#c2cbdb' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
            {f.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, dot, valueColor = '#0f1722' }: {
  label: string; value: string | number; sub: string; dot: string; valueColor?: string
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaee', borderRadius: 13, padding: '15px 16px', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: dot, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#5c6b7f' }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 27, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1, color: valueColor }}>{value}</div>
      <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 6 }}>{sub}</div>
    </div>
  )
}

// ── Attention item ────────────────────────────────────────────────────────────

function AttentionItem({ change, onAction }: {
  change: DetectedChangeWithCompetitor
  onAction: () => void
}) {
  const sev = SEV_META[change.severity] ?? SEV_META.low
  const typ = TYPE_META[change.change_type] ?? TYPE_META.content_change
  const comp = change.competitors?.name ?? 'Unknown'

  return (
    <div
      onClick={onAction}
      style={{ display: 'flex', alignItems: 'stretch', background: '#fff', border: '1px solid #e8eaee', borderRadius: 13, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}
      className="hover:border-blue-200 hover:shadow-sm transition-all"
    >
      <div style={{ width: 4, flexShrink: 0, background: sev.color }} />
      <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: avatarColor(comp), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
          {getInitial(comp)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' as const, color: sev.color, background: sev.bg, padding: '2px 7px', borderRadius: 5 }}>{sev.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' as const, color: typ.color, background: typ.bg, padding: '2px 7px', borderRadius: 5 }}>{typ.label}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0f1722' }}>{comp}</span>
            <span style={{ fontSize: 11, color: '#b6bcc7' }}>{timeAgo(change.detected_at)}</span>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f1722', lineHeight: 1.35 }}>{change.title}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#fff', background: sev.ctaBg, padding: '8px 14px', borderRadius: 9, flexShrink: 0 }}>
          Counter it
          <ArrowRight size={13} />
        </span>
      </div>
    </div>
  )
}

// ── Active campaign card ──────────────────────────────────────────────────────

function ActiveCampaignCard({ campaign }: { campaign: Campaign }) {
  const channels = [
    campaign.meta_campaign_id && 'Meta',
    campaign.google_campaign_id && 'Google',
  ].filter(Boolean).join(' + ') || 'Draft'

  const stats = [
    { label: 'LEADS', value: campaign.leads_count ?? 0, color: '#1f9d5b', first: 'padding-left:0;border-left:none' },
    { label: 'BUDGET/DAY', value: campaign.daily_budget ? `$${campaign.daily_budget}` : '—', color: '#0f1722', first: '' },
    { label: 'STATUS', value: campaign.status.toUpperCase(), color: campaign.status === 'active' ? '#1f9d5b' : '#98a2b3', first: '' },
  ]

  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaee', borderRadius: 13, padding: '15px 17px', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: '#1f9d5b', background: '#e9f7ef', padding: '3px 8px', borderRadius: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1f9d5b', display: 'inline-block' }} />
          LIVE
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f1722', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{campaign.campaign_name}</span>
        <span style={{ fontSize: 11, color: '#98a2b3', flexShrink: 0 }}>vs {campaign.competitor_name} · {channels}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {stats.map((st, i) => (
          <div key={st.label} style={{ flex: 1, borderLeft: i === 0 ? 'none' : '1px solid #f1f2f4', paddingLeft: i === 0 ? 0 : 13 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: st.color, lineHeight: 1 }}>{st.value}</div>
            <div style={{ fontSize: 10, color: '#98a2b3', fontWeight: 600, letterSpacing: '.03em', textTransform: 'uppercase' as const, marginTop: 4 }}>{st.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Watchlist item ────────────────────────────────────────────────────────────

function WatchlistItem({
  competitor, lastChange,
}: {
  competitor: Pick<Competitor, 'id' | 'name' | 'website_url'>
  lastChange?: DetectedChangeWithCompetitor
}) {
  const comp = competitor.name
  const isActive = !!lastChange

  return (
    <Link
      to={`/timeline/${competitor.id}`}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: '1px solid #f1f2f4', textDecoration: 'none' }}
      className="hover:bg-gray-50/60 transition-colors"
    >
      <div style={{ width: 34, height: 34, borderRadius: 9, background: avatarColor(comp), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
        {getInitial(comp)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1722', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{comp}</div>
        <div style={{ fontSize: 11, color: '#98a2b3' }}>
          {lastChange ? lastChange.title.slice(0, 36) + (lastChange.title.length > 36 ? '…' : '') : 'Monitoring active'}
        </div>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: isActive ? '#e5484d' : '#1f9d5b', flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? '#e5484d' : '#1f9d5b' }} />
        {isActive ? 'New change' : 'Quiet'}
      </span>
    </Link>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [launchChange, setLaunchChange] = useState<DetectedChangeWithCompetitor | null>(null)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard_stats_v2', user?.id],
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const weekAgo = new Date(Date.now() - 7 * 86400000)
      const [competitors, changesToday, highSeverity7d, changes7d, openOpps, totalLeads, leads7d, camps7d] = await Promise.all([
        supabase.from('competitors').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('is_active', true),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('detected_at', todayStart.toISOString()),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('severity', 'high').gte('detected_at', weekAgo.toISOString()),
        supabase.from('detected_changes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('detected_at', weekAgo.toISOString()),
        supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'open'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('created_at', weekAgo.toISOString()),
        supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).gte('created_at', weekAgo.toISOString()),
      ])
      return {
        competitors:   competitors.count   ?? 0,
        changesToday:  changesToday.count   ?? 0,
        highSev7d:     highSeverity7d.count ?? 0,
        total7d:       changes7d.count      ?? 0,
        openOpps:      openOpps.count       ?? 0,
        totalLeads:    totalLeads.count     ?? 0,
        leads7d:       leads7d.count        ?? 0,
        camps7d:       camps7d.count        ?? 0,
      }
    },
    enabled: !!user,
    refetchInterval: 30000,
  })

  const { data: attentionChanges = [] } = useQuery({
    queryKey: ['attention_changes', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('detected_changes')
        .select('*, competitors(id, name, website_url, industry), monitored_pages(url, page_type)')
        .eq('user_id', user!.id)
        .in('severity', ['high', 'medium'])
        .order('detected_at', { ascending: false })
        .limit(10)
      return (data ?? []) as DetectedChangeWithCompetitor[]
    },
    enabled: !!user,
    refetchInterval: 60000,
  })

  const { data: recentChanges = [] } = useQuery({
    queryKey: ['recent_changes_dashboard', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('detected_changes')
        .select('*, competitors(id, name, website_url, industry), monitored_pages(url, page_type)')
        .eq('user_id', user!.id)
        .order('detected_at', { ascending: false })
        .limit(30)
      return (data ?? []) as DetectedChangeWithCompetitor[]
    },
    enabled: !!user,
  })

  const { data: activeCampaigns = [] } = useQuery({
    queryKey: ['active_campaigns_dashboard', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(3)
      return (data ?? []) as Campaign[]
    },
    enabled: !!user,
  })

  const { data: competitors = [] } = useQuery({
    queryKey: ['competitors_dashboard', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('competitors')
        .select('id, name, website_url')
        .eq('user_id', user!.id)
        .eq('is_active', true)
        .order('name')
        .limit(6)
      return (data ?? []) as Pick<Competitor, 'id' | 'name' | 'website_url'>[]
    },
    enabled: !!user,
  })

  const seedDemo = useMutation({
    mutationFn: () => supabase.rpc('seed_demo_data', { p_user_id: user!.id }) as unknown as Promise<unknown>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard_stats_v2'] })
      qc.invalidateQueries({ queryKey: ['attention_changes'] })
      qc.invalidateQueries({ queryKey: ['competitors_dashboard'] })
      toast('Demo data loaded!', 'success', 'Demo Ready')
    },
    onError: () => toast('Failed to load demo data', 'error'),
  })

  const competitorLastChange = useMemo(() => {
    const map: Record<string, DetectedChangeWithCompetitor> = {}
    for (const c of recentChanges) {
      if (!map[c.competitor_id]) map[c.competitor_id] = c
    }
    return map
  }, [recentChanges])

  const hasData = (stats?.competitors ?? 0) > 0

  const hour = new Date().getHours()
  const greeting = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', ' +
    (user?.user_metadata?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there') + '.'

  const highCount  = stats?.highSev7d ?? 0
  const totalCount = stats?.total7d ?? 0

  const threatFactors = [
    ...(highCount > 0  ? [{ label: `${highCount} high-threat signal${highCount > 1 ? 's' : ''} this week`, color: '#e5484d' }] : []),
    ...(stats?.changesToday ? [{ label: `${stats.changesToday} new signal${stats.changesToday > 1 ? 's' : ''} detected today`, color: '#f5a524' }] : []),
    { label: `${stats?.competitors ?? 0} competitors monitored`, color: '#6d8bff' },
  ]

  const summaryBold = highCount > 0
    ? `${highCount} high-threat signal${highCount > 1 ? 's' : ''} need a response today.`
    : 'No urgent threats — market is calm.'

  const summaryPre = `${stats?.openOpps ?? 0} open revenue opportunit${(stats?.openOpps ?? 0) === 1 ? 'y' : 'ies'} detected. `

  if (statsLoading) return <PageSpinner />

  return (
    <div style={{ padding: 24, maxWidth: 1240 }}>

      {/* ── Briefing hero ── */}
      <div style={{ display: 'flex', borderRadius: 18, overflow: 'hidden', marginBottom: 22, boxShadow: '0 8px 30px rgba(11,15,23,.28)' }}>

        {/* Left: briefing */}
        <div style={{ flex: 1, background: 'linear-gradient(135deg,#0b0f17,#141d33)', color: '#fff', padding: '30px 32px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' as const }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' as const, color: '#b9c4ff', background: 'rgba(109,74,255,.18)', border: '1px solid rgba(109,74,255,.35)', padding: '4px 10px', borderRadius: 6 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b9c4ff" strokeWidth="2">
                <path d="M12 2 9.2 9.2 2 12l7.2 2.8L12 22l2.8-7.2L22 12l-7.2-2.8z" />
              </svg>
              AI morning briefing
            </span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#7a869c' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 10 }}>{greeting}</h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: '#c2cbdb', maxWidth: 560 }}>
            {summaryPre}<b style={{ color: '#fff' }}>{summaryBold}</b>
          </p>
          <div style={{ flex: 1, minHeight: 18 }} />
          {!hasData ? (
            <button
              onClick={() => seedDemo.mutate()}
              disabled={seedDemo.isPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#2563eb', color: '#fff', fontSize: 13.5, fontWeight: 700, border: 'none', padding: '11px 18px', borderRadius: 10, cursor: 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,.4)', width: 'fit-content' }}
            >
              <Sparkles size={14} />
              {seedDemo.isPending ? 'Loading…' : 'Load demo data'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => navigate('/interception')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#2563eb', color: '#fff', fontSize: 13.5, fontWeight: 700, border: 'none', padding: '11px 18px', borderRadius: 10, cursor: 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,.4)' }}
              >
                Open Command Center
                <ArrowRight size={14} />
              </button>
              <button
                onClick={() => navigate('/opportunities')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 13.5, fontWeight: 600, border: '1px solid rgba(255,255,255,.16)', padding: '11px 18px', borderRadius: 10, cursor: 'pointer' }}
              >
                Review opportunities
              </button>
            </div>
          )}
        </div>

        {/* Right: threat meter */}
        <ThreatMeter highCount={highCount} totalCount={totalCount} factors={threatFactors} />
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        <KpiCard label="Signals today"      value={stats?.changesToday ?? 0}    sub="across competitors"      dot="#2563eb" />
        <KpiCard label="High threats (7d)"  value={stats?.highSev7d ?? 0}       sub="need a response"         dot="#e5484d" valueColor={highCount > 0 ? '#e5484d' : '#0f1722'} />
        <KpiCard label="Open opportunities" value={stats?.openOpps ?? 0}        sub="AI-scored revenue opps"  dot="#6d4aff" />
        <KpiCard label="Leads captured"     value={stats?.totalLeads ?? 0}      sub={`+${stats?.leads7d ?? 0} this week`} dot="#1f9d5b" />
      </div>

      {/* ── Two-column body ── */}
      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>

        {/* ── Left column ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Attention items */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: '#5c6b7f' }}>Needs your attention today</span>
            {attentionChanges.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#e5484d', background: '#fdeceb', padding: '2px 8px', borderRadius: 99 }}>{Math.min(attentionChanges.length, 5)}</span>
            )}
            <div style={{ flex: 1 }} />
            <Link to="/timeline" style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
          </div>

          {attentionChanges.length === 0 ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 13, padding: '18px 20px', marginBottom: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>✓</span>
              <div>
                <div style={{ fontWeight: 600, color: '#15803d', fontSize: 13.5 }}>No urgent signals right now</div>
                <div style={{ fontSize: 12, color: '#4ade80', marginTop: 2 }}>Competitors are quiet — good time to capture market share.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 26 }}>
              {attentionChanges.slice(0, 4).map(c => (
                <AttentionItem
                  key={c.id}
                  change={c}
                  onAction={() => setLaunchChange(c)}
                />
              ))}
            </div>
          )}

          {/* Active campaigns */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: '#5c6b7f' }}>Active counter-campaigns</span>
            {activeCampaigns.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#1f9d5b', fontWeight: 600 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1f9d5b', display: 'inline-block', animation: 'pulse 1.6s ease-in-out infinite' }} />
                {activeCampaigns.length} live
              </span>
            )}
            <div style={{ flex: 1 }} />
            <Link to="/campaigns" style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
          </div>

          {activeCampaigns.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #e8eaee', borderRadius: 13, padding: '18px 20px', textAlign: 'center', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
              <Rocket size={22} style={{ color: '#d1d5db', marginBottom: 8 }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: '#5c6b7f' }}>No active campaigns yet</p>
              <p style={{ fontSize: 12, color: '#98a2b3', marginTop: 4 }}>Counter a competitor signal to launch your first campaign.</p>
              <Link to="/interception" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, fontSize: 12.5, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                Go to Counter Campaign <ArrowRight size={12} />
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {activeCampaigns.map(c => (
                <ActiveCampaignCard key={c.id} campaign={c} />
              ))}
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div style={{ width: 330, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Competitor watchlist */}
          <div style={{ background: '#fff', border: '1px solid #e8eaee', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.04)', overflow: 'hidden' }}>
            <div style={{ padding: '15px 18px', borderBottom: '1px solid #f1f2f4', display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: '#5c6b7f', flex: 1 }}>Competitor watchlist</span>
              <span style={{ fontSize: 11, color: '#98a2b3' }}>{competitors.length} tracked</span>
            </div>
            {competitors.length === 0 ? (
              <div style={{ padding: '18px 18px', textAlign: 'center' }}>
                <p style={{ fontSize: 12.5, color: '#98a2b3' }}>No competitors yet</p>
                <Link to="/competitors" style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>Add competitor →</Link>
              </div>
            ) : (
              <>
                {competitors.map(c => (
                  <WatchlistItem
                    key={c.id}
                    competitor={c}
                    lastChange={competitorLastChange[c.id]}
                  />
                ))}
                <Link to="/timeline" style={{ display: 'block', padding: '13px 18px', textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                  className="hover:bg-gray-50 transition-colors"
                >
                  View all signals →
                </Link>
              </>
            )}
          </div>

          {/* This week */}
          <div style={{ background: '#fff', border: '1px solid #e8eaee', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.04)', padding: '17px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: '#5c6b7f', marginBottom: 14 }}>This week</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {[
                { label: 'Signals detected',    value: stats?.total7d  ?? 0, color: '#0f1722' },
                { label: 'Campaigns launched',  value: stats?.camps7d  ?? 0, color: '#2563eb' },
                { label: 'Leads captured',      value: stats?.leads7d  ?? 0, color: '#1f9d5b' },
                {
                  label: 'Response rate',
                  value: stats?.total7d ? `${Math.round((stats.camps7d / stats.total7d) * 100)}%` : '—',
                  color: '#6d4aff'
                },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ fontSize: 12.5, color: '#5c6b7f', flex: 1 }}>{r.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick nav */}
          <Link
            to="/opportunities"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 14, background: 'linear-gradient(135deg,#2563eb,#4f46e5)', color: '#fff', textDecoration: 'none', boxShadow: '0 4px 14px rgba(37,99,235,.28)' }}
            className="hover:opacity-90 transition-opacity"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Zap size={15} />
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                {stats?.openOpps ? `${stats.openOpps} opportunities ready` : 'Opportunity Radar'}
              </span>
            </div>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {/* Campaign modal */}
      {launchChange && (
        <CampaignModal
          change={launchChange}
          open
          onClose={() => setLaunchChange(null)}
        />
      )}
    </div>
  )
}
