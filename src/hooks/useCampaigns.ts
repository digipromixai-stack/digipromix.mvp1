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

async function callEdgeFunction(fnName: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  const data = await res.json()
  if (!res.ok && !data.success) throw new Error(data.error ?? data.message ?? `${fnName} failed`)
  return data
}

export function useUpdateCampaignStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, googleCampaignId, metaCampaignId }: {
      id: string
      status: CampaignStatus
      googleCampaignId?: string | null
      metaCampaignId?: string | null
    }) => {
      const action = status === 'paused' ? 'pause' : 'enable'

      if ((status === 'paused' || status === 'active')) {
        // Sync to Google Ads if linked
        if (googleCampaignId) {
          await callEdgeFunction('manage-google-ads-campaign', { campaign_id: id, action })
          // Edge function updates DB — skip DB-only update below unless Meta also needs sync
          if (!metaCampaignId) return
        }
        // Sync to Meta if linked
        if (metaCampaignId) {
          await callEdgeFunction('manage-meta-campaign', { campaign_id: id, action })
          return
        }
      }

      // No ad platform linked — just update DB
      const { error } = await supabase.from('campaigns').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useDeleteCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, googleCampaignId, metaCampaignId }: {
      id: string
      googleCampaignId?: string | null
      metaCampaignId?: string | null
    }) => {
      if (googleCampaignId) {
        await callEdgeFunction('manage-google-ads-campaign', { campaign_id: id, action: 'delete' })
        return
      }
      if (metaCampaignId) {
        await callEdgeFunction('manage-meta-campaign', { campaign_id: id, action: 'delete' })
        return
      }
      const { error } = await supabase.from('campaigns').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}
