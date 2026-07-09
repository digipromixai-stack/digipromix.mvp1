import { useAuth } from '../../contexts/AuthContext'
import { LogOut } from 'lucide-react'
import { AlertBell } from '../alerts/AlertBell'

export function TopNav() {
  const { user, signOut } = useAuth()
  const initials = (user?.email ?? '?')
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface-card/90 backdrop-blur-xl border-b border-border-subtle shadow-sm z-20">
      <div className="h-full flex items-center px-4 sm:px-6 gap-4">
        {/* Spacer for hamburger button on mobile */}
        <div className="w-8 lg:hidden" />

        {/* Brand — visible on mobile only (sidebar is hidden) */}
        <span className="text-base font-bold text-primary lg:hidden">DigiPromix AI</span>

        {/* Search (desktop) */}
        <div className="relative hidden md:block w-full max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] opacity-60">
            search
          </span>
          <input
            type="text"
            placeholder="Search opportunities, leads, or reports..."
            className="w-full bg-surface-container text-sm pl-10 pr-4 py-2 rounded-full border-none focus:ring-2 focus:ring-primary/20 placeholder:text-on-surface-variant/50"
          />
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 sm:gap-3">
          <AlertBell />

          {/* Avatar pill (desktop) */}
          <div className="hidden sm:flex items-center gap-2 pl-2 pr-3 py-1 rounded-full bg-surface-container hover:bg-surface-container-high transition-colors max-w-[240px]">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-white text-xs font-semibold shrink-0">
              {initials}
            </span>
            <span className="text-sm text-on-surface truncate">{user?.email}</span>
          </div>

          {/* Avatar only (mobile) */}
          <span className="sm:hidden flex items-center justify-center w-9 h-9 rounded-full bg-primary text-white text-xs font-semibold">
            {initials}
          </span>

          <button
            onClick={signOut}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:scale-[0.98] transition-all"
            aria-label="Sign out"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  )
}
