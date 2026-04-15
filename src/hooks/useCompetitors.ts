import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Competitor } from '../types/database.types'

export function useCompetitors() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['competitors', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('competitors')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Competitor[]
    },
    enabled: !!user,
  })
}

export function useAddCompetitor() {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { name: string; website_url: string; industry?: string }) => {
      const { data, error } = await supabase
        .from('competitors')
        .insert({ ...payload, user_id: user!.id })
        .select()
        .single()
      if (error) throw error

      // Auto-create home + pricing monitored pages
      const homeUrl = payload.website_url.replace(/\/$/, '')
      const pricingUrl = homeUrl + '/pricing'
      await supabase.from('monitored_pages').upsert(
        [
          { competitor_id: data.id, user_id: user!.id, url: homeUrl, page_type: 'home' },
          { competitor_id: data.id, user_id: user!.id, url: pricingUrl, page_type: 'pricing' },
        ],
        { onConflict: 'competitor_id,url', ignoreDuplicates: true }
      )
      return data as Competitor
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['competitors'] })
      qc.invalidateQueries({ queryKey: ['monitored_pages'] })
    },
  })
}

export function useUpdateCompetitor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Competitor> & { id: string }) => {
      const { error } = await supabase.from('competitors').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitors'] }),
  })
}

export function useDeleteCompetitor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('competitors').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitors'] }),
  })
}
