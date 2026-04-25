import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts'
import { format, subDays, eachDayOfInterval, startOfDay } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { PageSpinner } from '../components/ui/Spinner'
import { ChangeTypeBadge } from '../components/ui/Badge'
import { TrendingUp, Zap, AlertTriangle, BarChart2, Users, Rocket } from 'lucide-react'
import type { DetectedChangeWithCompetitor, Campaign, LeadWithCampaign } from '../types/database.types'

// ── constants ────────────────────────────────────────────────────────────────

const CHANGE_COLORS: Record<string, string> = {
  promotion:       '#ef4444',
  price_change:    '#f97316',
  new_landing_page:'#8b5cf6',
  new_blog_post:   '#3b82f6',
  banner_change:   '#eab308',
  content_change:  '#9ca3af',
  keyword_match:   '#10b981',
}

const CHANGE_LABELS: Record<string, string> = {
  promotion:       'Promotion',
  price_change:    'Price Change',
  new_landing_page:'New Landing Page',
  new_blog_post:   'New Blog Post',
  banner_change:   'Banner Change',
  content_change:  'Content Change',
  keyword_match:   'Keyword Match',
}

const LEAD_STATUS_COLORS: Record<string, string> = {
  new:       '#3b82f6',
  contacted: '#f97316',
  qualified: '#10b981',
  closed:    '#6b7280',
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({ value, label, sub, color = 'text-gray-900' }: {
  value: string | number; label: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className={`text-3xl font-bold ${color} leading-none`}>{value}</p>
      <p className="text-sm text-gray-500 mt-1.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Tab: Competitor Intelligence ──────────────────────────────────────────────

function CompetitorTab({ days }: { days: number }) {
  const { user } = useAuth()

  const { data: changes = [], isLoading, isError } = useQuery({
    queryKey: ['analytics_changes', user?.id, days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString()
      const { data } = await supabase
        .from('detected_changes')
        .select('*, competitors(id, name, website_url), monitored_pages(url, page_type)')
        .eq('user_id', user!.id)
        .gte('detected_at', since)
        .order('detected_at', { ascending: true })
      return (data ?? []) as DetectedChangeWithCompetitor[]
    },
    enabled: !!user,
  })

  const dailyData = useMemo(() => {
    const interval = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() })
    return interval.map((day) => {
      const s = startOfDay(day).toISOString()
      const e = new Date(startOfDay(day).getTime() + 86400000).toISOString()
      const dayChanges = changes.filter((c) => c.detected_at >= s && c.detected_at < e)
      const row: Record<string, unknown> = { date: format(day, 'MMM d'), total: dayChanges.length }
      Object.keys(CHANGE_COLORS).forEach((t) => { row[t] = dayChanges.filter((c) => c.change_type === t).length })
      return row
    })
  }, [changes, days])

  const typeData = useMemo(() => {
    const counts: Record<string, number> = {}
    changes.forEach((c) => { counts[c.change_type] = (counts[c.change_type] ?? 0) + 1 })
    return Object.entries(counts)
      .map(([type, value]) => ({ name: CHANGE_LABELS[type] ?? type, value, color: CHANGE_COLORS[type] ?? '#6b7280' }))
      .sort((a, b) => b.value - a.value)
  }, [changes])

  const ranking = useMemo(() => {
    const map: Record<string, { id: string; name: string; total: number; high: number }> = {}
    changes.forEach((c) => {
      if (!map[c.competitor_id])
        map[c.competitor_id] = { id: c.competitor_id, name: c.competitors?.name ?? '?', total: 0, high: 0 }
      map[c.competitor_id].total++
      if (c.severity === 'high') map[c.competitor_id].high++
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [changes])

  const highCount = changes.filter((c) => c.severity === 'high').length
  const avgPerDay = days > 0 ? (changes.length / days).toFixed(1) : '0'
  const topCompetitor = ranking[0]?.name ?? '—'

  if (isLoading) return <PageSpinner />
  if (isError) return <p className="text-sm text-red-500 text-center py-8">Failed to load competitor data.</p>

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard value={changes.length} label="Total changes" sub={`last ${days} days`} />
        <StatCard value={highCount} label="High severity" color={highCount > 0 ? 'text-red-600' : 'text-gray-900'} sub="promotions & price changes" />
        <StatCard value={avgPerDay} label="Avg per day" sub="change velocity" />
        <StatCard value={topCompetitor} label="Most active" sub={`${ranking[0]?.total ?? 0} changes`} />
      </div>

      {/* Daily bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Daily Change Activity</h2>
        <p className="text-xs text-gray-400 mb-5">Stacked by change type</p>
        {changes.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">No changes detected in this period</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                formatter={(v, name) => [v as string, CHANGE_LABELS[name as string] ?? (name as string)] as [string, string]}
                cursor={{ fill: '#f9fafb' }} />
              {Object.entries(CHANGE_COLORS).map(([type, color], i, arr) => (
                <Bar key={type} dataKey={type} stackId="a" fill={color} name={type}
                  radius={i === arr.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Pie + ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Change Type Breakdown</h2>
          <p className="text-xs text-gray-400 mb-4">Distribution across all detected changes</p>
          {typeData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">No data in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={typeData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                  {typeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Competitor Leaderboard</h2>
          <p className="text-xs text-gray-400 mb-4">Ranked by total changes detected</p>
          {ranking.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">No data in this period</div>
          ) : (
            <div className="space-y-4">
              {ranking.map((c, i) => (
                <Link key={c.id} to={`/timeline/${c.id}`} className="block group">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-300 w-5 text-right">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{c.name}</span>
                        <div className="flex items-center gap-2">
                          {c.high > 0 && (
                            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                              <AlertTriangle size={10} />{c.high}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">{c.total}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${Math.round((c.total / (ranking[0]?.total || 1)) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* High-severity moves */}
      {changes.filter((c) => c.severity === 'high').length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Zap size={14} className="text-red-500" /> High-Priority Moves
          </h2>
          <p className="text-xs text-gray-400 mb-4">Promotions and price changes in this period</p>
          <div className="space-y-3">
            {changes.filter((c) => c.severity === 'high').slice().reverse().slice(0, 8).map((c) => (
              <div key={c.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <ChangeTypeBadge type={c.change_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                  {c.description && <p className="text-xs text-gray-500 truncate mt-0.5">{c.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <Link to={`/timeline/${c.competitor_id}`} className="text-xs font-medium text-blue-600 hover:underline">
                    {c.competitors?.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">{format(new Date(c.detected_at), 'MMM d, HH:mm')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {changes.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center">
          <TrendingUp size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No data in the last {days} days</p>
          <p className="text-xs text-gray-400 mt-1">Add competitors and trigger crawls to see analytics</p>
        </div>
      )}
    </div>
  )
}

// ── Tab: Campaigns & Leads ────────────────────────────────────────────────────

function CampaignsLeadsTab({ days }: { days: number }) {
  const { user } = useAuth()

  const { data: campaigns = [] } = useQuery({
    queryKey: ['analytics_campaigns', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('id, campaign_name, status, leads_count, channels, created_at, template')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      return (data ?? []) as Campaign[]
    },
    enabled: !!user,
  })

  const { data: leads = [] } = useQuery({
    queryKey: ['analytics_leads', user?.id, days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString()
      const { data } = await supabase
        .from('leads')
        .select('*, campaigns(campaign_name, competitor_name)')
        .eq('user_id', user!.id)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
      return (data ?? []) as LeadWithCampaign[]
    },
    enabled: !!user,
  })

  // Daily leads line chart
  const leadsDaily = useMemo(() => {
    const interval = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() })
    return interval.map(day => {
      const s = startOfDay(day).toISOString()
      const e = new Date(startOfDay(day).getTime() + 86400000).toISOString()
      return {
        date:  format(day, 'MMM d'),
        leads: leads.filter(l => l.created_at >= s && l.created_at < e).length,
      }
    })
  }, [leads, days])

  // Lead status pie
  const leadStatusData = useMemo(() => {
    const counts: Record<string, number> = { new: 0, contacted: 0, qualified: 0, closed: 0 }
    leads.forEach(l => { counts[l.status] = (counts[l.status] ?? 0) + 1 })
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([status, value]) => ({
        name: status.charAt(0).toUpperCase() + status.slice(1),
        value,
        color: LEAD_STATUS_COLORS[status] ?? '#6b7280',
      }))
  }, [leads])

  // Top 5 campaigns by leads_count
  const topCampaigns = useMemo(() =>
    [...campaigns]
      .filter(c => c.leads_count > 0)
      .sort((a, b) => b.leads_count - a.leads_count)
      .slice(0, 5)
  , [campaigns])

  const avgScore = leads.length > 0
    ? Math.round(leads.reduce((s, l) => s + (l.score ?? 0), 0) / leads.length)
    : 0

  const qualifiedRate = leads.length > 0
    ? Math.round((leads.filter(l => l.status === 'qualified' || l.status === 'closed').length / leads.length) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard value={leads.length}   label="Total leads"      sub={`last ${days} days`} />
        <StatCard value={`${avgScore}%`} label="Avg lead score"   color={avgScore >= 60 ? 'text-green-600' : 'text-gray-900'} />
        <StatCard value={`${qualifiedRate}%`} label="Qualification rate" sub="qualified + closed" color={qualifiedRate >= 30 ? 'text-green-600' : 'text-gray-900'} />
        <StatCard value={campaigns.filter(c => c.status === 'active').length} label="Active campaigns" sub="currently running" />
      </div>

      {/* Daily leads line chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Users size={14} className="text-blue-500" /> Daily Lead Capture
        </h2>
        <p className="text-xs text-gray-400 mb-5">Leads submitted from landing pages</p>
        {leads.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">No leads in this period</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={leadsDaily} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Line type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6' }} name="Leads" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Lead status pie + top campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Lead Status Breakdown</h2>
          <p className="text-xs text-gray-400 mb-4">How are leads progressing through the funnel?</p>
          {leadStatusData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">No leads in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={leadStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                  {leadStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Rocket size={14} className="text-orange-500" /> Top Campaigns by Leads
          </h2>
          <p className="text-xs text-gray-400 mb-4">Best performing landing pages</p>
          {topCampaigns.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">No campaigns with leads yet</div>
          ) : (
            <div className="space-y-4">
              {topCampaigns.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-300 w-5 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-900 truncate">{c.campaign_name}</span>
                      <span className="text-xs font-semibold text-blue-600 ml-2 shrink-0">{c.leads_count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.round((c.leads_count / (topCampaigns[0]?.leads_count || 1)) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Channel distribution */}
      {campaigns.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Campaign Channel Mix</h2>
          <div className="grid grid-cols-3 gap-4">
            {['google', 'meta', 'instagram'].map(ch => {
              const count = campaigns.filter(c => c.channels?.includes(ch)).length
              const pct = campaigns.length > 0 ? Math.round((count / campaigns.length) * 100) : 0
              return (
                <div key={ch} className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">{ch}</p>
                  <div className="h-1 bg-gray-100 rounded-full mt-2">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{pct}%</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

type TabKey = 'intelligence' | 'campaigns'

export function AnalyticsPage() {
  const [days, setDays]   = useState(14)
  const [tab,  setTab]    = useState<TabKey>('intelligence')

  return (
    <div className="space-y-5 sm:space-y-6 max-w-6xl">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <BarChart2 size={22} className="text-blue-600" />
            Analytics
          </h1>
          <p className="text-gray-500 text-sm mt-1">Intelligence trends and campaign performance</p>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm rounded-lg font-medium transition-colors ${
                days === d
                  ? 'bg-blue-600 text-white shadow-soft'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'intelligence', label: 'Competitor Intelligence', icon: Zap },
          { key: 'campaigns',    label: 'Campaigns & Leads',       icon: Users },
        ] as { key: TabKey; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white text-gray-900 shadow-soft'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'intelligence' && <CompetitorTab days={days} />}
      {tab === 'campaigns'    && <CampaignsLeadsTab days={days} />}
    </div>
  )
}
