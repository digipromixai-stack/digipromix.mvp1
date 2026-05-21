/**
 * MVP 2.0 — Revenue Opportunity Feed
 *
 * The new homepage. Replaces the legacy DashboardPage at `/` once the AI
 * Decision Engine starts producing opportunities (Phase 2 / Week 4–5).
 *
 * For now: skeleton + empty state. Realtime subscription, filters, and
 * launch-campaign CTA arrive in Week 5 per the delivery plan.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, TrendingUp, Target, DollarSign, Zap,
  ArrowRight, Filter, Search, RefreshCcw,
} from 'lucide-react'
import { useOpportunities } from '../hooks/useOpportunities'
import type { Opportunity } from '../types/database.types'

function ScoreBadge({ score }: { score: number }) {
  let bg = 'bg-gray-100 text-gray-700'
  let label = 'Low'
  if (score >= 75) { bg = 'bg-red-100 text-red-700';     label = '🔥 High' }
  else if (score >= 50) { bg = 'bg-amber-100 text-amber-700'; label = '⚡ Medium' }
  else if (score >= 25) { bg = 'bg-blue-100 text-blue-700';   label = 'Watch' }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${bg}`}>
      {label} · {Math.round(score)}
    </span>
  )
}

function OpportunityCard({ opp }: { opp: Opportunity }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-1">
            {opp.market_name ?? `${opp.industry ?? 'General'} · ${opp.location ?? 'Global'}`}
          </p>
          <h3 className="font-semibold text-gray-900 text-base leading-snug">{opp.title}</h3>
        </div>
        <ScoreBadge score={opp.opportunity_score} />
      </div>

      {opp.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{opp.description}</p>
      )}

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Leads</div>
          <div className="text-sm font-bold text-gray-900">{opp.expected_leads ?? '—'}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">CPC</div>
          <div className="text-sm font-bold text-gray-900">${opp.estimated_cpc?.toFixed(2) ?? '—'}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Confidence</div>
          <div className="text-sm font-bold text-gray-900">
            {opp.confidence != null ? `${Math.round(opp.confidence * 100)}%` : '—'}
          </div>
        </div>
      </div>

      {opp.recommended_action && (
        <p className="text-sm text-blue-700 mb-3 flex items-start gap-1.5">
          <Sparkles size={14} className="shrink-0 mt-0.5" />
          <span>{opp.recommended_action}</span>
        </p>
      )}

      <button className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors">
        Launch Campaign <ArrowRight size={14} />
      </button>
    </div>
  )
}

export function OpportunityFeedPage() {
  const [statusFilter] = useState<'open'>('open')
  const { data: opportunities = [], isLoading, refetch } = useOpportunities({ status: statusFilter })

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Target size={20} className="text-blue-500" />
            <h1 className="text-2xl font-bold text-gray-900">Opportunity Radar</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-2 py-0.5 rounded">
              Beta
            </span>
          </div>
          <p className="text-sm text-gray-500">
            AI-scored revenue opportunities based on competitor signals, search trends, and your campaign history.
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <button className="border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5">
            <Filter size={14} /> Filters
          </button>
          <button onClick={() => refetch()} className="border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5">
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Open opportunities', value: opportunities.length, icon: Target, color: 'blue' },
          { label: 'High score (≥75)', value: opportunities.filter(o => o.opportunity_score >= 75).length, icon: TrendingUp, color: 'red' },
          { label: 'Avg confidence', value: opportunities.length ? Math.round(opportunities.reduce((s, o) => s + (o.confidence ?? 0), 0) / opportunities.length * 100) + '%' : '—', icon: Sparkles, color: 'violet' },
          { label: 'Total expected leads', value: opportunities.reduce((s, o) => s + (o.expected_leads ?? 0), 0), icon: DollarSign, color: 'green' },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-1">
                <Icon size={14} className={`text-${stat.color}-500`} /> {stat.label}
              </div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
            </div>
          )
        })}
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">
          <Search className="mx-auto mb-3 animate-pulse" size={32} />
          Scanning signals…
        </div>
      ) : opportunities.length === 0 ? (
        <div className="bg-gradient-to-br from-blue-50 via-violet-50 to-pink-50 border border-blue-100 rounded-2xl p-12 text-center">
          <Zap size={48} className="mx-auto mb-4 text-blue-500" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Your first opportunity is coming soon</h2>
          <p className="text-sm text-gray-600 mb-5 max-w-md mx-auto">
            DigiPromix is scanning competitor activity, search trends, and ad spend signals. As real signals
            start flowing, scored opportunities will appear here in real-time.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center max-w-md mx-auto">
            <Link to="/competitors" className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg">
              Add a competitor
            </Link>
            <Link to="/settings" className="border border-gray-300 hover:bg-white text-gray-700 text-sm font-semibold py-2 px-4 rounded-lg">
              Connect ad accounts
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {opportunities.map(opp => <OpportunityCard key={opp.id} opp={opp} />)}
        </div>
      )}
    </div>
  )
}
