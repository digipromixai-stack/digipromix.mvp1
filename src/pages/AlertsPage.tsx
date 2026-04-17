import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ChangeTypeBadge, SeverityBadge, Badge } from '../components/ui/Badge'
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Alerts</h1>
          <p className="text-gray-500 text-sm mt-1">
            {unreadCount > 0 ? (
              <>
                <span className="text-blue-600 font-medium">{unreadCount} unread</span>
                <span className="mx-1.5 text-gray-300">·</span>
                <span>{alerts.length} total</span>
              </>
            ) : (
              `${alerts.length} alert${alerts.length !== 1 ? 's' : ''}`
            )}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markAllRead.mutate()}
            loading={markAllRead.isPending}
            className="w-full sm:w-auto"
          >
            <CheckCheck size={16} /> Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alerts yet"
          description="Alerts will appear here when changes are detected on competitor pages."
        />
      ) : (
        <div className="space-y-2.5">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              hover
              className={alert.status === 'pending' ? 'ring-1 ring-blue-100 bg-blue-50/30' : ''}
            >
              <CardContent className="py-3.5 sm:py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {alert.detected_changes?.change_type && (
                        <ChangeTypeBadge type={alert.detected_changes.change_type} />
                      )}
                      {alert.detected_changes?.severity && (
                        <SeverityBadge severity={alert.detected_changes.severity} />
                      )}
                      {alert.status === 'pending' && (
                        <Badge variant="info" dot>New</Badge>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 leading-snug">
                      {alert.detected_changes?.title ?? 'Change detected'}
                    </p>
                    {alert.detected_changes?.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                        {alert.detected_changes.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Link
                        to={`/timeline/${alert.detected_changes?.competitor_id}`}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        {alert.detected_changes?.competitors?.name}
                      </Link>
                      <span className="text-xs text-gray-300">·</span>
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
