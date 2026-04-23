import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface AdIntegration {
  id: string
  user_id: string
  platform: 'meta' | 'google'
  account_id: string
  account_name: string | null
  page_id: string | null
  page_name: string | null
  token_expires_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export function useAdIntegrations() {
  return useQuery<AdIntegration[]>({
    queryKey: ['ad_integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_integrations')
        .select('id, user_id, platform, account_id, account_name, page_id, page_name, token_expires_at, is_active, created_at, updated_at')
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []) as AdIntegration[]
    },
  })
}

export function useMetaIntegration() {
  const { data: integrations = [], ...rest } = useAdIntegrations()
  return {
    ...rest,
    metaIntegration: integrations.find(i => i.platform === 'meta') ?? null,
  }
}

export function useInvalidateIntegrations() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['ad_integrations'] })
}
