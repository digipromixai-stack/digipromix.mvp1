import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/Toast'

export function useRealtimeAlerts() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('user-alerts-' + user.id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          // Invalidate alerts and changes queries so they refetch
          queryClient.invalidateQueries({ queryKey: ['alerts'] })
          queryClient.invalidateQueries({ queryKey: ['detected_changes'] })
          queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] })

          // Show toast for dashboard alerts with real change details
          const alert = payload.new as { channel: string; change_id: string }
          if (alert.channel === 'dashboard' && alert.change_id) {
            // Fetch the change + competitor name for a meaningful toast message
            const { data: change } = await supabase
              .from('detected_changes')
              .select('title, severity, competitors(name)')
              .eq('id', alert.change_id)
              .single()

            if (change) {
              const competitor = (change.competitors as unknown as { name: string } | null)?.name
              const variant = change.severity === 'high' ? 'error' : change.severity === 'medium' ? 'info' : 'info'
              toast(
                change.title,
                variant,
                competitor ? `Change detected · ${competitor}` : 'New Change Detected'
              )
            } else {
              toast('A competitor change was detected', 'info', 'New Alert')
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, queryClient, toast])
}
