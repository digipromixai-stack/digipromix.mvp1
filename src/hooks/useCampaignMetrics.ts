import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useValuePerLead } from './useProfile'

export interface CampaignMetricRow {
  date:            string
  platform:        'meta' | 'google'
  impressions:     number
  clicks:          number
  spend:           number
  conversions:     number
  ctr:             number | null
  cpc:             number | null
  conversion_rate: number | null
}

export interface CampaignMetricsSummary {
  total_spend:       number
  total_clicks:      number
  total_impressions: number
  total_conversions: number
  avg_ctr:           number | null
  avg_cpc:           number | null
  // Real outcomes — leads come from the leads table (landing-page form fills),
  // NOT ad-platform "conversions" (this app's conversion tracking often isn't
  // wired up per-account, so platform conversions read 0 even when real leads
  // were captured). real_roi/real_cpl are MEASURED from actual spend + actual
  // leads × the user's configured value_per_lead — not the pre-launch estimate.
  total_leads:       number
  real_cpl:          number | null   // actual cost per lead = spend / leads
  real_roi:          number | null   // actual ROI = (leads × value_per_lead) / spend
  rows:              CampaignMetricRow[]
  has_data:          boolean
}

export function useCampaignMetrics(campaignId: string | undefined) {
  const { user } = useAuth()
  const valuePerLead = useValuePerLead()

  return useQuery({
    queryKey: ['campaign_metrics', campaignId, valuePerLead],
    queryFn: async (): Promise<CampaignMetricsSummary> => {
      const [perfRes, leadsRes] = await Promise.all([
        supabase
          .from('campaign_performance')
          .select('date, platform, impressions, clicks, spend, conversions, ctr, cpc, conversion_rate')
          .eq('campaign_id', campaignId!)
          .eq('user_id', user!.id)
          .order('date', { ascending: false })
          .limit(30),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId!)
          .eq('user_id', user!.id),
      ])

      const rows = (perfRes.data ?? []) as CampaignMetricRow[]
      const total_leads = leadsRes.count ?? 0

      if (rows.length === 0) {
        return {
          total_spend: 0, total_clicks: 0, total_impressions: 0, total_conversions: 0,
          avg_ctr: null, avg_cpc: null, total_leads, real_cpl: null, real_roi: null,
          rows: [], has_data: false,
        }
      }

      const total_spend       = rows.reduce((s, r) => s + Number(r.spend       ?? 0), 0)
      const total_clicks      = rows.reduce((s, r) => s + Number(r.clicks      ?? 0), 0)
      const total_impressions = rows.reduce((s, r) => s + Number(r.impressions ?? 0), 0)
      const total_conversions = rows.reduce((s, r) => s + Number(r.conversions ?? 0), 0)
      const avg_ctr  = total_impressions > 0 ? (total_clicks / total_impressions) * 100 : null
      const avg_cpc  = total_clicks > 0 ? total_spend / total_clicks : null

      // Real cost-per-lead and ROI. If money was spent but no leads came in,
      // real_roi is 0 (a truthful, if unflattering, result) rather than null —
      // null is reserved for "no spend yet, nothing to measure".
      const real_cpl = total_leads > 0 ? total_spend / total_leads : null
      const real_roi = total_spend > 0 ? (total_leads * valuePerLead) / total_spend : null

      return {
        total_spend, total_clicks, total_impressions, total_conversions,
        avg_ctr, avg_cpc, total_leads, real_cpl, real_roi, rows, has_data: true,
      }
    },
    enabled: !!user && !!campaignId,
    staleTime: 10 * 60 * 1000, // 10 min — optimize-campaigns runs daily
  })
}
