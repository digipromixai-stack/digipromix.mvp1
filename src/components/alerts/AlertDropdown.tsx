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
  const { user } = useAuth()
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
    queryKey: ['alerts', 'dropdown', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('alerts')
        .select(`*, detected_changes(*, competitors(id, name, website_url, industry), monitored_pages(url, page_type))`)
        .eq('user_id', user!.id)
        .eq('channel', 'dashboard')
        .order('created_at', { ascending: false })
        .limit(10)
      return (data ?? []) as AlertWithChange[]
    },
    enabled: !!user,
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      await supabase
        .from('alerts')
        .update({ status: 'sent' as const })
        .eq('user_id', user!.id)
        .eq('channel', 'dashboard')
        .eq('status', 'pending')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
    },
  })

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-50"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">Recent Alerts</span>
        <button
          onClick={() => markAllRead.mutate()}
          className="text-xs text-blue-600 hover:underline"
        >
          Mark all read
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {!isLoading && alerts.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No alerts yet</p>
        )}
        {alerts.map((alert) => (
          <Link
            key={alert.id}
            to={`/timeline/${alert.detected_changes?.competitor_id}`}
            onClick={onClose}
            className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
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
          View all alerts
        </Link>
      </div>
    </div>
  )
}
