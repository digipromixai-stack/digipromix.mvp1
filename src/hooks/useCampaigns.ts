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
      // 'completed' is treated as a final pause: stop ads on platforms, then mark DB as completed.
      // 'paused' → pause on platforms. 'active' → enable on platforms. 'draft' → DB only.
      const platformAction =
        status === 'active'                          ? 'enable'
        : (status === 'paused' || status === 'completed') ? 'pause'
        : null

      if (platformAction) {
        // Sync to Google Ads if linked
        if (googleCampaignId) {
          await callEdgeFunction('manage-google-ads-campaign', { campaign_id: id, action: platformAction })
        }
        // Sync to Meta if linked
        if (metaCampaignId) {
          await callEdgeFunction('manage-meta-campaign', { campaign_id: id, action: platformAction })
        }
        // For 'completed', the edge functions set DB to 'paused' — overwrite to 'completed' here.
        // For 'paused'/'active', the edge functions already set the correct DB status.
        if (status === 'completed') {
          const { error } = await supabase.from('campaigns').update({ status: 'completed' }).eq('id', id)
          if (error) throw error
        } else if (!googleCampaignId && !metaCampaignId) {
          // No ad platform linked — DB-only update
          const { error } = await supabase.from('campaigns').update({ status }).eq('id', id)
          if (error) throw error
        }
        return
      }

      // 'draft' or other DB-only states
      const { error } = await supabase.from('campaigns').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useUpdateCampaignBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, daily_budget, metaCampaignId, googleCampaignId }: {
      id: string
      daily_budget: number
      metaCampaignId?: string | null
      googleCampaignId?: string | null
    }) => {
      // If linked to Meta, sync budget there first (it also updates DB on success)
      if (metaCampaignId) {
        await callEdgeFunction('manage-meta-campaign', {
          campaign_id: id,
          action: 'update_budget',
          daily_budget,
        })
        return
      }
      // If linked to Google (future), add similar call here

      // DB-only update for unlinked campaigns
      const { error } = await supabase
        .from('campaigns')
        .update({ daily_budget })
        .eq('id', id)
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
