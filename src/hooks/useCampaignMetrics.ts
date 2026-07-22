import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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
  rows:              CampaignMetricRow[]
  has_data:          boolean
}

export function useCampaignMetrics(campaignId: string | undefined) {
  const { businessId } = useAuth()

  return useQuery({
    queryKey: ['campaign_metrics', campaignId],
    queryFn: async (): Promise<CampaignMetricsSummary> => {
      const { data } = await supabase
        .from('campaign_performance')
        .select('date, platform, impressions, clicks, spend, conversions, ctr, cpc, conversion_rate')
        .eq('campaign_id', campaignId!)
        .eq('user_id', businessId!)
        .order('date', { ascending: false })
        .limit(30)

      const rows = (data ?? []) as CampaignMetricRow[]

      if (rows.length === 0) {
        return { total_spend: 0, total_clicks: 0, total_impressions: 0, total_conversions: 0, avg_ctr: null, avg_cpc: null, rows: [], has_data: false }
      }

      const total_spend       = rows.reduce((s, r) => s + Number(r.spend       ?? 0), 0)
      const total_clicks      = rows.reduce((s, r) => s + Number(r.clicks      ?? 0), 0)
      const total_impressions = rows.reduce((s, r) => s + Number(r.impressions ?? 0), 0)
      const total_conversions = rows.reduce((s, r) => s + Number(r.conversions ?? 0), 0)
      const avg_ctr  = total_impressions > 0 ? (total_clicks / total_impressions) * 100 : null
      const avg_cpc  = total_clicks > 0 ? total_spend / total_clicks : null

      return { total_spend, total_clicks, total_impressions, total_conversions, avg_ctr, avg_cpc, rows, has_data: true }
    },
    enabled: !!businessId && !!campaignId,
    staleTime: 10 * 60 * 1000, // 10 min — optimize-campaigns runs daily
  })
}
