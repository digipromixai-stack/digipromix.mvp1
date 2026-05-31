import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { AiRecommendation } from '../types/database.types'

// Joined type — includes the campaign name so the UI can display it without
// a separate lookup per recommendation.
export interface AiRecommendationWithCampaign extends AiRecommendation {
  campaigns: { campaign_name: string; status: string } | null
}

/** Fetch all active (not applied/dismissed) recommendations for this user. */
export function useAiRecommendations(campaignId?: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ai_recommendations', user?.id, campaignId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('ai_recommendations')
        .select('*, campaigns(campaign_name, status)')
        .eq('user_id', user!.id)
        .is('applied_at', null)
        .is('dismissed_at', null)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20)

      if (campaignId) q = q.eq('campaign_id', campaignId)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as AiRecommendationWithCampaign[]
    },
    enabled: !!user,
    // Refresh every 5 min — optimize-campaigns runs daily so no need to poll faster
    staleTime: 5 * 60 * 1000,
  })
}

/** Mark a recommendation as applied. */
export function useApplyRecommendation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_recommendations')
        .update({ applied_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_recommendations'] }),
  })
}

/** Dismiss a recommendation (user doesn't want to act on it). */
export function useDismissRecommendation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_recommendations')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_recommendations'] }),
  })
}
