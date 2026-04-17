import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center px-6 animate-fade-in-up">
      <div className="relative mb-5">
        <div className="absolute inset-0 bg-gradient-brand rounded-full blur-2xl opacity-20" />
        <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 ring-1 ring-blue-100 shadow-soft">
          <Icon size={28} className="text-blue-600" strokeWidth={1.75} />
        </div>
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1.5 text-balance">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 max-w-sm mb-5 text-pretty leading-relaxed">
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
