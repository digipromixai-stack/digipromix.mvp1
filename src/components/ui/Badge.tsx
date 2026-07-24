import { cn } from '../../lib/utils'
import type { ChangeType, Severity } from '../../types/database.types'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'pink'
  size?: 'xs' | 'sm'
  dot?: boolean
  className?: string
}

export function Badge({ children, variant = 'default', size = 'xs', dot, className }: BadgeProps) {
  const variants = {
    default: 'bg-surface-container text-on-surface-variant ring-border-subtle',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    warning: 'bg-orange-tint text-warning ring-warning/20',
    danger:  'bg-red-tint text-danger ring-danger/20',
    info:    'bg-indigo-tint text-primary ring-primary/20',
    purple:  'bg-secondary-container text-on-secondary-container ring-secondary/20',
    pink:    'bg-pink-50 text-pink-700 ring-pink-200',
  }

  const dotColors = {
    default: 'bg-gray-400',
    success: 'bg-success',
    warning: 'bg-warning',
    danger:  'bg-danger',
    info:    'bg-primary',
    purple:  'bg-secondary',
    pink:    'bg-pink-500',
  }

  const sizes = {
    xs: 'px-2 py-0.5 text-[11px] gap-1',
    sm: 'px-2.5 py-1 text-xs gap-1.5',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium ring-1 ring-inset',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />}
      {children}
    </span>
  )
}

const changeTypeConfig: Record<ChangeType, { label: string; variant: BadgeProps['variant'] }> = {
  campaign_launch:  { label: 'Campaign Launch',  variant: 'warning' },
  promotion:        { label: 'Promotion',        variant: 'danger' },
  price_change:     { label: 'Price Change',     variant: 'warning' },
  new_landing_page: { label: 'New Landing Page', variant: 'info' },
  new_blog_post:    { label: 'New Blog Post',    variant: 'success' },
  banner_change:    { label: 'Banner Change',    variant: 'purple' },
  content_change:   { label: 'Content Change',   variant: 'default' },
}

export function ChangeTypeBadge({ type }: { type: ChangeType }) {
  const config = changeTypeConfig[type] ?? { label: type, variant: 'default' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

const severityConfig: Record<Severity, { label: string; variant: BadgeProps['variant'] }> = {
  high:   { label: 'High',   variant: 'danger' },
  medium: { label: 'Medium', variant: 'warning' },
  low:    { label: 'Low',    variant: 'default' },
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const config = severityConfig[severity]
  return <Badge variant={config.variant} dot>{config.label}</Badge>
}
