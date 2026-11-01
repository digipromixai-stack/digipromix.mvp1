import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Profile } from '../types/database.types'
import { DEFAULT_VALUE_PER_LEAD } from '../lib/economics'

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      return data as Profile | null
    },
    enabled: !!user,
  })
}

// Fields the business profile set-up requires before campaigns can be
// generated. Keep in sync with the check in supabase/functions/generate-campaign.
export const REQUIRED_PROFILE_FIELDS = [
  'business_name', 'website_url', 'industry', 'city', 'main_offer', 'selling_point',
] as const

export function isProfileComplete(profile: Profile | null | undefined): boolean {
  if (!profile) return false
  return REQUIRED_PROFILE_FIELDS.every(k => String(profile[k] ?? '').trim().length > 0)
}

// Convenience hook for pages that only need the ROI/revenue estimate input —
// falls back to the app default until the user sets their own value in Settings.
export function useValuePerLead(): number {
  const { data: profile } = useProfile()
  return profile?.value_per_lead ?? DEFAULT_VALUE_PER_LEAD
}
