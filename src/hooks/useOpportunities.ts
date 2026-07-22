/**
 * MVP 2.0 — Opportunity Feed query hook.
 *
 * Reads scored opportunities from the AI Decision Engine. The Engine itself
 * (Python FastAPI service) is built in Week 4; until then this hook returns
 * an empty list and the UI shows the "first opportunity coming soon" empty
 * state. Wiring is in place now so the frontend ships ready for Phase 2.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Opportunity, OpportunityStatus } from '../types/database.types'

interface OpportunityFilters {
  status?: OpportunityStatus
  industry?: string
  location?: string
  minScore?: number
  limit?: number
}

export function useOpportunities(filters: OpportunityFilters = {}) {
  const { businessId } = useAuth()
  const {
    status = 'open',
    industry,
    location,
    minScore,
    limit = 50,
  } = filters

  return useQuery({
    queryKey: ['opportunities', businessId, status, industry, location, minScore, limit],
    queryFn: async () => {
      let query = supabase
        .from('opportunities')
        .select('*')
        .eq('user_id', businessId!)
        .order('opportunity_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)

      if (status)    query = query.eq('status', status)
      if (industry)  query = query.eq('industry', industry)
      if (location)  query = query.eq('location', location)
      if (minScore != null) query = query.gte('opportunity_score', minScore)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Opportunity[]
    },
    enabled: !!businessId,
  })
}
