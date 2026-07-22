import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo } from '../../lib/utils'
import { ChangeTypeBadge } from '../ui/Badge'
import { Spinner } from '../ui/Spinner'
import type { AlertWithChange } from '../../types/database.types'

export function AlertDropdown({ onClose }: { onClose: () => void }) {
  const { businessId } = useAuth()
  const qc = useQueryClient()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['alerts', 'dropdown', businessId],
    queryFn: async () => {
      const { data } = await supabase
        .from('alerts')
        .select(`*, detected_changes(*, competitors(id, name, website_url, industry), monitored_pages(url, page_type))`)
        .eq('user_id', businessId!)
        .eq('channel', 'dashboard')
        .order('created_at', { ascending: false })
        .limit(10)
      return (data ?? []) as AlertWithChange[]
    },
    enabled: !!businessId,
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      await supabase
        .from('alerts')
        .update({ status: 'sent' as const })
        .eq('user_id', businessId!)
        .eq('channel', 'dashboard')
        .eq('status', 'pending')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const markOneRead = useMutation({
    mutationFn: async (alertId: string) => {
      await supabase
        .from('alerts')
        .update({ status: 'sent' as const })
        .eq('id', alertId)
        .eq('status', 'pending')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const unreadCount = alerts.filter(a => a.status === 'pending').length

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-50"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {!isLoading && alerts.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No notifications yet</p>
        )}
        {alerts.map((alert) => (
          <Link
            key={alert.id}
            to={`/timeline/${alert.detected_changes?.competitor_id}`}
            onClick={() => {
              if (alert.status === 'pending') markOneRead.mutate(alert.id)
              onClose()
            }}
            className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors ${
              alert.status === 'pending' ? 'bg-blue-50/40' : ''
            }`}
          >
            {alert.status === 'pending' && (
              <span className="mt-2 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${alert.status === 'pending' ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                {alert.detected_changes?.title ?? 'Change detected'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {alert.detected_changes?.competitors?.name} &middot; {timeAgo(alert.created_at)}
              </p>
            </div>
            {alert.detected_changes?.change_type && (
              <ChangeTypeBadge type={alert.detected_changes.change_type} />
            )}
          </Link>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-gray-100">
        <Link to="/alerts" onClick={onClose} className="text-xs text-blue-600 hover:underline">
          View all notifications
        </Link>
      </div>
    </div>
  )
}
