import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Lead, LeadWithCampaign, LeadStatus } from '../types/database.types'

export function useLeads(status?: LeadStatus) {
  return useQuery<LeadWithCampaign[]>({
    queryKey: ['leads', status],
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('*, campaigns(campaign_name, competitor_name)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as LeadWithCampaign[]
    },
  })
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase.from('leads').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useDeleteLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leads').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useLeadStats() {
  return useQuery({
    queryKey: ['lead_stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('status, score')
      if (error) throw error
      const all = data ?? []
      return {
        total:     all.length,
        new:       all.filter(l => l.status === 'new').length,
        contacted: all.filter(l => l.status === 'contacted').length,
        qualified: all.filter(l => l.status === 'qualified').length,
        closed:    all.filter(l => l.status === 'closed').length,
        avgScore:  all.length ? Math.round(all.reduce((s, l) => s + (l.score ?? 0), 0) / all.length) : 0,
      }
    },
  })
}
