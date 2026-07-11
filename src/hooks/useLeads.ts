import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { LeadWithCampaign, LeadStatus } from '../types/database.types'

export function useLeads(status?: LeadStatus) {
  const { user } = useAuth()
  return useQuery<LeadWithCampaign[]>({
    queryKey: ['leads', status, user?.id],
    queryFn: async () => {
      let q = supabase
        .from('leads')
        .select('*, campaigns(campaign_name, competitor_name)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as LeadWithCampaign[]
    },
    enabled: !!user,
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

export function useLeadTrends() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['lead_trends', user?.id],
    queryFn: async () => {
      const now = Date.now()
      const weekAgo = new Date(now - 7 * 86400000).toISOString()
      const twoWeeksAgo = new Date(now - 14 * 86400000).toISOString()
      const { data, error } = await supabase
        .from('leads')
        .select('score, created_at, campaign_id')
        .eq('user_id', user!.id)
        .gte('created_at', twoWeeksAgo)
      if (error) throw error
      const rows = data ?? []
      const tierOf = (s: number): 'hot' | 'medium' | 'low' => (s >= 70 ? 'hot' : s >= 40 ? 'medium' : 'low')
      const buckets = {
        hot:    { cur: 0, prev: 0, campaigns: new Set<string>() },
        medium: { cur: 0, prev: 0, campaigns: new Set<string>() },
        low:    { cur: 0, prev: 0, campaigns: new Set<string>() },
      }
      for (const r of rows) {
        const b = buckets[tierOf(r.score ?? 0)]
        const isCurrent = r.created_at >= weekAgo
        if (isCurrent) {
          b.cur++
          if (r.campaign_id) b.campaigns.add(r.campaign_id)
        } else {
          b.prev++
        }
      }
      const pctChange = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100))
      return {
        hot:    { changePct: pctChange(buckets.hot.cur, buckets.hot.prev),    activeCampaigns: buckets.hot.campaigns.size },
        medium: { changePct: pctChange(buckets.medium.cur, buckets.medium.prev), activeCampaigns: buckets.medium.campaigns.size },
        low:    { changePct: pctChange(buckets.low.cur, buckets.low.prev),    activeCampaigns: buckets.low.campaigns.size },
      }
    },
    enabled: !!user,
  })
}

export function useLeadStats() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['lead_stats', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('status, score')
        .eq('user_id', user!.id)
      if (error) throw error
      const all = data ?? []
      return {
        total:     all.length,
        new:       all.filter(l => l.status === 'new').length,
        contacted: all.filter(l => l.status === 'contacted').length,
        qualified: all.filter(l => l.status === 'qualified').length,
        closed:    all.filter(l => l.status === 'closed').length,
        avgScore:  all.length ? Math.round(all.reduce((s, l) => s + (l.score ?? 0), 0) / all.length) : 0,
        hot:    all.filter(l => (l.score ?? 0) >= 70).length,
        medium: all.filter(l => (l.score ?? 0) >= 40 && (l.score ?? 0) < 70).length,
        low:    all.filter(l => (l.score ?? 0) < 40).length,
      }
    },
    enabled: !!user,
  })
}
