import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { MonitoredPage, PageType } from '../types/database.types'

export function useMonitoredPages(competitorId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['monitored_pages', competitorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monitored_pages')
        .select('*')
        .eq('competitor_id', competitorId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as MonitoredPage[]
    },
    enabled: !!user && !!competitorId,
  })
}

export function useAddMonitoredPage() {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { competitor_id: string; url: string; page_type: PageType }) => {
      const { error } = await supabase
        .from('monitored_pages')
        .insert({ ...payload, user_id: user!.id })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['monitored_pages', variables.competitor_id] })
    },
  })
}

export function useDeleteMonitoredPage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, competitor_id }: { id: string; competitor_id: string }) => {
      const { error } = await supabase.from('monitored_pages').delete().eq('id', id)
      if (error) throw error
      return competitor_id
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['monitored_pages', variables.competitor_id] })
    },
  })
}
