import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ChangeTypeBadge, SeverityBadge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { timeAgo } from '../lib/utils'
import type { AlertWithChange } from '../types/database.types'

export function AlertsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['alerts', 'all', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('alerts')
        .select('*, detected_changes(*, competitors(id, name, website_url, industry), monitored_pages(url, page_type))')
        .eq('user_id', user!.id)
        .eq('channel', 'dashboard')
        .order('created_at', { ascending: false })
        .limit(100)
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const unreadCount = alerts.filter((a) => a.status === 'pending').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-500 text-sm mt-1">{unreadCount} unread alert{unreadCount !== 1 ? 's' : ''}</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={() => markAllRead.mutate()} loading={markAllRead.isPending}>
            <CheckCheck size={16} /> Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : alerts.length === 0 ? (
        <EmptyState icon={Bell} title="No alerts yet" description="Alerts will appear here when changes are detected on competitor pages." />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card key={alert.id} className={alert.status === 'pending' ? 'border-blue-200 bg-blue-50/30' : ''}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {alert.detected_changes?.change_type && (
                        <ChangeTypeBadge type={alert.detected_changes.change_type} />
                      )}
                      {alert.detected_changes?.severity && (
                        <SeverityBadge severity={alert.detected_changes.severity} />
                      )}
                      {alert.status === 'pending' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      {alert.detected_changes?.title ?? 'Change detected'}
                    </p>
                    {alert.detected_changes?.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{alert.detected_changes.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Link
                        to={`/timeline/${alert.detected_changes?.competitor_id}`}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        {alert.detected_changes?.competitors?.name}
                      </Link>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-400">{timeAgo(alert.created_at)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
