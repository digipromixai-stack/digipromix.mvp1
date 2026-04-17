import { useAuth } from '../../contexts/AuthContext'
import { LogOut, User } from 'lucide-react'
import { AlertBell } from '../alerts/AlertBell'

export function TopNav() {
  const { user, signOut } = useAuth()
  const initials = (user?.email ?? '?')
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-white/80 backdrop-blur-xl border-b border-gray-200/70 z-20">
      <div className="h-full flex items-center px-4 sm:px-6">
        {/* Spacer for hamburger button on mobile */}
        <div className="w-12 lg:hidden" />
        <div className="flex-1" />

        <div className="flex items-center gap-2 sm:gap-3">
          <AlertBell />

          {/* Avatar pill (desktop) */}
          <div className="hidden sm:flex items-center gap-2 pl-2 pr-3 py-1 rounded-full bg-gray-100/70 hover:bg-gray-100 transition-colors max-w-[240px]">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-brand text-white text-xs font-semibold shrink-0">
              {initials}
            </span>
            <span className="text-sm text-gray-700 truncate">{user?.email}</span>
          </div>

          {/* Avatar only (mobile) */}
          <span className="sm:hidden flex items-center justify-center w-9 h-9 rounded-full bg-gradient-brand text-white text-xs font-semibold">
            {initials || <User size={16} />}
          </span>

          <button
            onClick={signOut}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:scale-[0.98] transition-all"
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
