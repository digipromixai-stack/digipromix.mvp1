import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, invokeFunction } from '../lib/supabase'

export interface AdIntegration {
  id: string
  user_id: string
  platform: 'meta' | 'google'
  account_id: string
  account_name: string | null
  page_id: string | null
  page_name: string | null
  token_expires_at: string | null
  currency: string | null
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
        .select('id, user_id, platform, account_id, account_name, page_id, page_name, token_expires_at, currency, is_active, created_at, updated_at')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AdIntegration[]
    },
  })
}

// Per-currency minimum daily budget for Meta — keep in sync with the
// table in supabase/functions/launch-meta-campaign/index.ts
export const CURRENCY_MIN_DAILY: Record<string, number> = {
  USD: 1,    EUR: 1,    GBP: 1,    CAD: 1,    AUD: 1,    NZD: 1,
  JPY: 100,
  INR: 40,   AED: 4,    SAR: 4,    EGP: 8,    QAR: 4,    KWD: 0.3,
  BRL: 3,    MXN: 20,   ARS: 100,
  ZAR: 15,   NGN: 400,
  TRY: 5,    RUB: 60,   IDR: 14000, MYR: 4, PHP: 50, THB: 30, VND: 23000,
  SGD: 2,    HKD: 8,    TWD: 30,
  CNY: 7,    KRW: 1200,
  CHF: 1,    SEK: 10,   NOK: 10,   DKK: 7,    PLN: 4,    CZK: 23,
}

export function minDailyForCurrency(currency: string | null | undefined): number {
  if (!currency) return 1
  return CURRENCY_MIN_DAILY[currency] ?? 1
}

export function useMetaIntegration() {
  const { data: integrations = [], ...rest } = useAdIntegrations()
  const metaIntegration = integrations.find(i => i.platform === 'meta') ?? null
  const isExpired = metaIntegration
    ? !metaIntegration.is_active || (!!metaIntegration.token_expires_at && new Date(metaIntegration.token_expires_at).getTime() <= Date.now())
    : false
  return {
    ...rest,
    metaIntegration,
    isExpired,
    isConnected: !!metaIntegration && !isExpired,
  }
}

/** "INR" → "₹", "EUR" → "€". Falls back to the code itself if Intl has no symbol. */
export function currencySymbol(currency: string | null | undefined): string {
  if (!currency) return '€'
  try {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(p => p.type === 'currency')
    return part?.value ?? currency
  } catch {
    return currency
  }
}

/**
 * Currency symbol for a campaign's amounts (budget, spend). Meta campaigns are
 * charged in the connected ad account's currency, so show that instead of a
 * hard-coded "€". Non-Meta campaigns keep the € default.
 */
export function useCampaignCurrencySymbol(campaign: { meta_campaign_id?: string | null }): string {
  const { metaIntegration } = useMetaIntegration()
  return campaign.meta_campaign_id && metaIntegration?.currency
    ? currencySymbol(metaIntegration.currency)
    : '€'
}

export function useGoogleAdsIntegration() {
  const { data: integrations = [], ...rest } = useAdIntegrations()
  const googleIntegration = integrations.find(i => i.platform === 'google') ?? null
  // token_expires_at is the 1-hour access token, which is refreshed on demand —
  // only the live check (check-integrations → is_active) says whether the
  // refresh token itself still works.
  const isExpired = googleIntegration ? !googleIntegration.is_active : false
  return {
    ...rest,
    googleIntegration,
    isExpired,
    isConnected: !!googleIntegration && !isExpired,
  }
}

/**
 * Asks Meta and Google live whether the stored tokens still work (instead of
 * trusting the stored flag), then refreshes the integration list so Settings
 * shows the true status. Runs once per mount of the calling page.
 */
export function useLiveIntegrationCheck() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['ad_integrations_live_check'],
    queryFn: async () => {
      const { data, error } = await invokeFunction<Record<string, { status: string; detail?: string }>>('check-integrations', {})
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['ad_integrations'] })
      return data ?? {}
    },
    staleTime: 60_000,
    retry: false,
  })
}

export function useInvalidateIntegrations() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['ad_integrations'] })
}
