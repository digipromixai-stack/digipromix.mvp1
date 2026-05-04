import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Campaign, CampaignStatus } from '../types/database.types'

export function useCampaigns() {
  return useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Campaign[]
    },
  })
}

/** Call the manage-google-ads-campaign edge function */
async function callManageGoogleAds(campaignId: string, action: 'pause' | 'enable' | 'delete') {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-google-ads-campaign`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ campaign_id: campaignId, action }),
    }
  )
  const json = await res.json()
  if (!res.ok && !json.success) throw new Error(json.error ?? json.message ?? 'Google Ads update failed')
  return json
}

export function useUpdateCampaignStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, googleCampaignId }: {
      id: string
      status: CampaignStatus
      googleCampaignId?: string | null
    }) => {
      // If campaign is linked to Google Ads, sync via edge function
      if (googleCampaignId && (status === 'paused' || status === 'active')) {
        const action = status === 'paused' ? 'pause' : 'enable'
        await callManageGoogleAds(id, action)
        // Edge function already updates DB status — done
        return
      }

      // Otherwise just update DB
      const { error } = await supabase
        .from('campaigns')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useDeleteCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, googleCampaignId }: {
      id: string
      googleCampaignId?: string | null
    }) => {
      if (googleCampaignId) {
        // Delete from Google Ads + DB via edge function
        await callManageGoogleAds(id, 'delete')
        return
      }
      // No Google Ads link — just delete from DB
      const { error } = await supabase.from('campaigns').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}
