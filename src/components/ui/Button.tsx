import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, fullWidth, children, ...props }, ref) => {
    const base =
      'relative inline-flex items-center justify-center font-medium rounded-lg ' +
      'transition-all duration-150 ease-out select-none whitespace-nowrap ' +
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white ' +
      'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'

    const variants = {
      primary:
        'text-white bg-gradient-brand shadow-soft hover:shadow-soft-md hover:brightness-105 ' +
        'focus-visible:ring-blue-500',
      secondary:
        'bg-white text-gray-800 border border-gray-200 shadow-soft hover:bg-gray-50 hover:border-gray-300 ' +
        'focus-visible:ring-blue-500',
      outline:
        'bg-transparent text-blue-600 border border-blue-200 hover:bg-blue-50 hover:border-blue-300 ' +
        'focus-visible:ring-blue-500',
      ghost:
        'text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-gray-300',
      danger:
        'text-white bg-gradient-danger shadow-soft hover:shadow-soft-md hover:brightness-105 ' +
        'focus-visible:ring-red-500',
      success:
        'text-white bg-gradient-success shadow-soft hover:shadow-soft-md hover:brightness-105 ' +
        'focus-visible:ring-emerald-500',
    }

    const sizes = {
      xs: 'px-2.5 py-1   text-xs   gap-1   rounded-md',
      sm: 'px-3   py-1.5 text-sm   gap-1.5',
      md: 'px-4   py-2   text-sm   gap-2',
      lg: 'px-5   py-2.5 text-base gap-2',
    }

    return (
      <button
        ref={ref}
        className={cn(
          base,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          loading && 'cursor-wait',
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4 -ml-0.5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
