import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Client } from '../types/database.types'

export type { Client }

// ── Read ─────────────────────────────────────────────────────────────────────

export function useClients() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['clients', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Client[]
    },
    enabled: !!user,
  })
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateClientInput {
  name: string
  industry?: string
  website?: string
  notes?: string
}

export function useCreateClient() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: CreateClientInput) => {
      const { error } = await supabase
        .from('clients')
        .insert({ user_id: user!.id, ...input })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Client> & { id: string }) => {
      const { error } = await supabase
        .from('clients')
        .update(data)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })
}

// ── Stats helper ──────────────────────────────────────────────────────────────

export function useClientStats(clientId: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['client_stats', clientId],
    queryFn: async () => {
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, status, leads_count')
        .eq('user_id', user!.id)
        .eq('client_id', clientId)
      const rows = campaigns ?? []
      return {
        total:   rows.length,
        active:  rows.filter(c => c.status === 'active').length,
        leads:   rows.reduce((s, c) => s + (c.leads_count ?? 0), 0),
      }
    },
    enabled: !!user && !!clientId,
  })
}
