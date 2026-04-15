import { cn } from '../../lib/utils'
import type { ChangeType, Severity } from '../../types/database.types'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  }

  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  )
}

const changeTypeConfig: Record<ChangeType, { label: string; variant: BadgeProps['variant'] }> = {
  promotion: { label: 'Promotion', variant: 'danger' },
  price_change: { label: 'Price Change', variant: 'warning' },
  new_landing_page: { label: 'New Landing Page', variant: 'info' },
  new_blog_post: { label: 'New Blog Post', variant: 'success' },
  banner_change: { label: 'Banner Change', variant: 'purple' },
  content_change: { label: 'Content Change', variant: 'default' },
}

export function ChangeTypeBadge({ type }: { type: ChangeType }) {
  const config = changeTypeConfig[type] ?? { label: type, variant: 'default' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

const severityConfig: Record<Severity, { label: string; variant: BadgeProps['variant'] }> = {
  high: { label: 'High', variant: 'danger' },
  medium: { label: 'Medium', variant: 'warning' },
  low: { label: 'Low', variant: 'default' },
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const config = severityConfig[severity]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
