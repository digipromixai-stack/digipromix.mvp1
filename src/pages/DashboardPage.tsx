import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { PageSpinner } from '../components/ui/Spinner'
import { timeAgo } from '../lib/utils'
import { useToast } from '../components/ui/Toast'
import { CampaignModal } from '../components/campaigns/CampaignModal'
import { ArrowRight, Sparkles, Zap, TrendingUp, Target, Users, AlertTriangle, CheckCircle } from 'lucide-react'
import type { DetectedChangeWithCompetitor, Competitor, Opportunity } from '../types/database.types'

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
  new_blog_post:    { color: '#2f8f7d', bg: '#e8f7f4', label: 'New Blog Post' },
  banner_change:    { color: '#7c5cd1', bg: '#f1ecfb', label: 'Banner Change' },
  content_change:   { color: '#667085', bg: '#f2f4f7', label: 'Content Change' },
}

// ── Threat level ──────────────────────────────────────────────────────────────

function threatLevel(highCount: number, totalCount: number) {
  const ratio = totalCount > 0 ? highCount / totalCount : 0
  if (highCount >= 6 || ratio > 0.5)  return { label: 'High',     score: 88, color: '#e5484d', bars: 5 }
  if (highCount >= 3 || ratio > 0.25) return { label: 'Elevated', score: 72, color: '#f5a524', bars: 4 }
  if (highCount >= 1 || ratio > 0.1)  return { label: 'Moderate', score: 45, color: '#6d8bff', bars: 3 }
  return                                      { label: 'Low',      score: 18, color: '#1f9d5b', bars: 1 }
}

// ── Top Opportunity Card (Hero) ───────────────────────────────────────────────

function TopOpportunityCard({ opp, onLaunch }: { opp: Opportunity; onLaunch: () => void }) {
  const score = Math.round(opp.opportunity_score)
  const confidence = Math.round((opp.confidence ?? 0) * 100)
  const leads = opp.expected_leads ?? 0
  const revenue = leads > 0 ? `$${(leads * 80).toLocaleString()}` : '—'
  const isHot = score >= 75

  return (
    <div style={{
      background: isHot
        ? 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 50%, #fef9f0 100%)'
        : 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)',
      border: `1.5px solid ${isHot ? '#fed7aa' : '#c7d2fe'}`,
      borderRadius: 16,
      padding: '22px 24px',
      marginBottom: 20,
      boxShadow: isHot
        ? '0 4px 20px rgba(234,88,12,.10)'
        : '0 4px 20px rgba(99,102,241,.08)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase',
          color: isHot ? '#c2410c' : '#4f46e5',
          background: isHot ? '#fed7aa' : '#c7d2fe',
          padding: '4px 10px', borderRadius: 6,
        }}>
          {isHot ? '🔥' : '⚡'} {isHot ? 'Top Revenue Opportunity' : 'Top Opportunity'}
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
          {opp.industry && `${opp.industry}${opp.location ? ' · ' + opp.location : ''}`}
        </span>
      </div>

      {/* Title + action */}
      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', lineHeight: 1.35, marginBottom: 6 }}>
        {opp.title}
      </h2>
      {opp.recommended_action && (
        <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.5, marginBottom: 16 }}>
          ✦ <strong>AI says:</strong> {opp.recommended_action}
        </p>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: 'rgba(255,255,255,.65)', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(0,0,0,.06)' }}>
        {[
          { label: 'AI Score', value: `${score}/100`, color: isHot ? '#ea580c' : '#4f46e5', icon: '🎯' },
          { label: 'Predicted Leads', value: leads > 0 ? `+${leads}` : '—', color: '#1f9d5b', icon: '👥' },
          { label: 'Est. Revenue', value: revenue, color: '#0f172a', icon: '💰' },
          { label: 'AI Confidence', value: `${confidence}%`, color: '#7c3aed', icon: '🧠' },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1,
            padding: '12px 14px',
            borderLeft: i > 0 ? '1px solid rgba(0,0,0,.06)' : 'none',
          }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{s.icon} {s.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Confidence bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>AI Confidence</span>
          <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>{confidence}%</span>
        </div>
        <div style={{ height: 5, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${confidence}%`, background: 'linear-gradient(90deg,#7c3aed,#6366f1)', borderRadius: 99, transition: 'width .6s ease' }} />
        </div>
      </div>

      {/* CTA */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onLaunch}
          style={{
            flex: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: isHot ? 'linear-gradient(135deg,#ea580c,#dc2626)' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            color: '#fff', fontSize: 14, fontWeight: 700,
            border: 'none', padding: '13px 20px', borderRadius: 10, cursor: 'pointer',
            boxShadow: isHot ? '0 4px 14px rgba(234,88,12,.35)' : '0 4px 14px rgba(99,102,241,.35)',
          }}
        >
          <Zap size={15} />
          Launch Campaign Now
          <ArrowRight size={14} />
        </button>
        <Link
          to="/opportunities"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '13px 18px', borderRadius: 10,
            fontSize: 13.5, fontWeight: 600, color: isHot ? '#c2410c' : '#4f46e5',
            background: 'rgba(255,255,255,.7)', border: `1px solid ${isHot ? '#fed7aa' : '#c7d2fe'}`,
            textDecoration: 'none',
          }}
        >
          View all
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, valueColor = '#0f1722', iconBg }: {
  label: string; value: string | number; sub: string; icon: typeof Target; valueColor?: string; iconBg: string
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaee', borderRadius: 13, padding: '16px 18px', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#5c6b7f' }}>{label}</span>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} color={valueColor} />
        </span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1, color: valueColor }}>{value}</div>
      <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 6 }}>{sub}</div>
    </div>
  )
}

// ── Threat level strip ────────────────────────────────────────────────────────

function ThreatStrip({ highCount, totalCount }: { highCount: number; totalCount: number }) {
  const threat = threatLevel(highCount, totalCount)
  const barColors = Array.from({ length: 5 }, (_, i) => i < threat.bars ? threat.color : '#e5e7eb')

  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaee', borderRadius: 13, padding: '16px 18px', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#5c6b7f' }}>Competitor Threat Level</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: threat.color, background: `${threat.color}18`, padding: '3px 8px', borderRadius: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: threat.color }} />
          {threat.label.toUpperCase()}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {barColors.map((c, i) => (
          <span key={i} style={{ flex: 1, height: 7, borderRadius: 3, background: c }} />
        ))}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 26, fontWeight: 700, color: threat.color, lineHeight: 1 }}>{threat.score}</div>
      <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 4 }}>
        {highCount > 0 ? `${highCount} high-threat signal${highCount > 1 ? 's' : ''} this week` : 'No urgent threats'}
      </div>
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
      <div style={{ flex: 1, minWidth: 0, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: avatarColor(comp), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
          {getInitial(comp)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, marginBottom: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' as const, color: sev.color, background: sev.bg, padding: '2px 6px', borderRadius: 4 }}>{sev.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' as const, color: typ.color, background: typ.bg, padding: '2px 6px', borderRadius: 4 }}>{typ.label}</span>
            <span style={{ fontSize: 11, color: '#b6bcc7' }}>{timeAgo(change.detected_at)}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1722', lineHeight: 1.3 }}>{change.title}</div>
          <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{comp}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#fff', background: sev.ctaBg, padding: '7px 12px', borderRadius: 8, flexShrink: 0 }}>
          Counter <ArrowRight size={12} />
        </span>
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
      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 16px', borderBottom: '1px solid #f1f2f4', textDecoration: 'none' }}
      className="hover:bg-gray-50/60 transition-colors"
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, background: avatarColor(comp), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
        {getInitial(comp)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1722', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{comp}</div>
        <div style={{ fontSize: 11, color: '#98a2b3' }}>
          {lastChange ? lastChange.title.slice(0, 34) + (lastChange.title.length > 34 ? '…' : '') : 'Monitoring active'}
        </div>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: isActive ? '#e5484d' : '#1f9d5b', flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? '#e5484d' : '#1f9d5b' }} />
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

  const { data: topOpportunity } = useQuery({
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
      qc.invalidateQueries({ queryKey: ['top_opportunity_dashboard'] })
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
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'
  const greeting = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', ' + firstName

  const highCount  = stats?.highSev7d ?? 0
  const totalCount = stats?.total7d ?? 0

  if (statsLoading) return <PageSpinner />

  return (
    <div style={{ padding: 24, maxWidth: 1240 }}>

      {/* ── Command Center Header ── */}
      <div style={{ background: '#fff', border: '1px solid #e8eaee', borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 1px 3px rgba(16,24,40,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#4f46e5', background: '#eef2ff', border: '1px solid #c7d2fe', padding: '3px 9px', borderRadius: 6 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.5">
                  <path d="M12 2 9.2 9.2 2 12l7.2 2.8L12 22l2.8-7.2L22 12l-7.2-2.8z" />
                </svg>
                Opportunity Command Center
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: '#1f9d5b', background: '#e9f7ef', padding: '3px 8px', borderRadius: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1f9d5b', animation: 'pulse 1.6s ease-in-out infinite' }} />
                Live monitoring active
              </span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f1722', letterSpacing: '-.02em', marginBottom: 4 }}>
              {greeting} 👋
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
              {stats?.openOpps
                ? <><strong style={{ color: '#0f1722' }}>{stats.openOpps} revenue {stats.openOpps === 1 ? 'opportunity' : 'opportunities'}</strong> detected — {highCount > 0 ? <><strong style={{ color: '#e5484d' }}>{highCount} high-threat signal{highCount > 1 ? 's' : ''}</strong> need a response today.</> : 'no urgent threats right now.'}</>
                : 'Setting up your intelligence feed — add competitors to get started.'
              }
            </p>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            {!hasData ? (
              <button
                onClick={() => seedDemo.mutate()}
                disabled={seedDemo.isPending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', padding: '10px 16px', borderRadius: 9, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,.3)' }}
              >
                <Sparkles size={13} />
                {seedDemo.isPending ? 'Loading…' : 'Load demo data'}
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/opportunities')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', padding: '10px 16px', borderRadius: 9, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,.3)' }}
                >
                  <Target size={13} />
                  All Opportunities
                  <ArrowRight size={12} />
                </button>
                <button
                  onClick={() => navigate('/interception')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, border: '1px solid #e5e7eb', padding: '10px 16px', borderRadius: 9, cursor: 'pointer' }}
                >
                  <Zap size={13} />
                  Counter Campaign
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Top Opportunity Hero ── */}
      {topOpportunity ? (
        <TopOpportunityCard
          opp={topOpportunity}
          onLaunch={() => navigate('/opportunities')}
        />
      ) : hasData ? (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: '18px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <CheckCircle size={22} style={{ color: '#1f9d5b', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: '#15803d', fontSize: 14 }}>No urgent opportunities right now</div>
            <div style={{ fontSize: 12.5, color: '#4ade80', marginTop: 2 }}>Competitors are quiet — great time to build your brand.</div>
          </div>
          <Link to="/opportunities" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: '#15803d', textDecoration: 'none', flexShrink: 0 }}>
            View all →
          </Link>
        </div>
      ) : null}

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 22 }}>
        <KpiCard
          label="Open Opportunities"
          value={stats?.openOpps ?? 0}
          sub="AI-scored revenue opps"
          icon={Target}
          valueColor="#4f46e5"
          iconBg="#eef2ff"
        />
        <KpiCard
          label="Leads Captured"
          value={stats?.totalLeads ?? 0}
          sub={`+${stats?.leads7d ?? 0} this week`}
          icon={Users}
          valueColor="#1f9d5b"
          iconBg="#e9f7ef"
        />
        <KpiCard
          label="High Threats (7d)"
          value={stats?.highSev7d ?? 0}
          sub={highCount > 0 ? 'Needs a response' : 'All clear'}
          icon={AlertTriangle}
          valueColor={highCount > 0 ? '#e5484d' : '#98a2b3'}
          iconBg={highCount > 0 ? '#fdeceb' : '#f9fafb'}
        />
        <ThreatStrip highCount={highCount} totalCount={totalCount} />
      </div>

      {/* ── Two-column body ── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Left column — Needs Your Attention ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: '#5c6b7f' }}>Needs your attention today</span>
            {attentionChanges.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#e5484d', background: '#fdeceb', padding: '2px 8px', borderRadius: 99 }}>{Math.min(attentionChanges.length, 3)}</span>
            )}
            <div style={{ flex: 1 }} />
            <Link to="/timeline" style={{ fontSize: 12, color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
          </div>

          {attentionChanges.length === 0 ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 13, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <CheckCircle size={20} style={{ color: '#1f9d5b', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, color: '#15803d', fontSize: 13.5 }}>No urgent signals right now</div>
                <div style={{ fontSize: 12, color: '#4ade80', marginTop: 2 }}>Good time to capture market share.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {attentionChanges.slice(0, 3).map(c => (
                <AttentionItem
                  key={c.id}
                  change={c}
                  onAction={() => setLaunchChange(c)}
                />
              ))}
              {attentionChanges.length > 3 && (
                <Link
                  to="/interception"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px', borderRadius: 12, border: '1.5px dashed #c7d2fe', fontSize: 13, fontWeight: 600, color: '#4f46e5', textDecoration: 'none' }}
                  className="hover:bg-indigo-50 transition-colors"
                >
                  <TrendingUp size={14} />
                  +{attentionChanges.length - 3} more signals — view Command Center
                  <ArrowRight size={13} />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div style={{ width: 310, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Competitor watchlist */}
          <div style={{ background: '#fff', border: '1px solid #e8eaee', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,.04)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f2f4', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: '#5c6b7f', flex: 1 }}>Competitor Watchlist</span>
              <span style={{ fontSize: 11, color: '#98a2b3' }}>{competitors.length} tracked</span>
            </div>
            {competitors.length === 0 ? (
              <div style={{ padding: '18px', textAlign: 'center' }}>
                <p style={{ fontSize: 12.5, color: '#98a2b3' }}>No competitors yet</p>
                <Link to="/competitors" style={{ fontSize: 12, color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}>Add competitor →</Link>
              </div>
            ) : (
              <>
                {competitors.slice(0, 5).map(c => (
                  <WatchlistItem
                    key={c.id}
                    competitor={c}
                    lastChange={competitorLastChange[c.id]}
                  />
                ))}
                <Link to="/timeline" style={{ display: 'block', padding: '12px 16px', textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: '#4f46e5', textDecoration: 'none' }}
                  className="hover:bg-gray-50 transition-colors"
                >
                  View all signals →
                </Link>
              </>
            )}
          </div>

          {/* Quick actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link
              to="/opportunities"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', textDecoration: 'none', boxShadow: '0 4px 14px rgba(79,70,229,.25)' }}
              className="hover:opacity-90 transition-opacity"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={14} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  {stats?.openOpps ? `${stats.openOpps} opportunities ready` : 'Opportunity Radar'}
                </span>
              </div>
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/leads"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderRadius: 12, background: '#fff', border: '1px solid #e8eaee', color: '#374151', textDecoration: 'none', boxShadow: '0 1px 2px rgba(16,24,40,.04)' }}
              className="hover:border-indigo-200 hover:shadow-sm transition-all"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={14} style={{ color: '#1f9d5b' }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {stats?.leads7d ? `${stats.leads7d} new leads this week` : 'Lead Intent Engine'}
                </span>
              </div>
              <ArrowRight size={14} style={{ color: '#9ca3af' }} />
            </Link>
          </div>
        </div>
      </div>

      {/* Campaign modal from attention item */}
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
