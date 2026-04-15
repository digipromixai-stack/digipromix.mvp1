import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { DetectedChangeWithCompetitor, ChangeType } from '../types/database.types'

interface ChangeFilters {
  competitorId?: string
  changeType?: ChangeType
  limit?: number
}

export function useDetectedChanges(filters: ChangeFilters = {}) {
  const { user } = useAuth()
  const { competitorId, changeType, limit = 50 } = filters

  return useQuery({
    queryKey: ['detected_changes', user?.id, competitorId, changeType, limit],
    queryFn: async () => {
      let query = supabase
        .from('detected_changes')
        .select('*, competitors(id, name, website_url, industry), monitored_pages(url, page_type)')
        .eq('user_id', user!.id)
        .order('detected_at', { ascending: false })
        .limit(limit)

      if (competitorId) query = query.eq('competitor_id', competitorId)
      if (changeType) query = query.eq('change_type', changeType)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as DetectedChangeWithCompetitor[]
    },
    enabled: !!user,
  })
}
