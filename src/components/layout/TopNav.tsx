import { Menu, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AlertBell } from '../alerts/AlertBell'

export function TopNav({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface-main/90 backdrop-blur-xl border-b border-border-subtle z-20">
      <div className="h-full flex items-center px-4 sm:px-6 gap-3">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors -ml-1.5"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Brand — visible on mobile only (sidebar is hidden) */}
        <span className="font-display font-semibold text-base text-primary lg:hidden">DigiPromix AI</span>

        <div className="flex-1" />

        <div className="flex items-center gap-2 sm:gap-2.5">
          <AlertBell />
          <Link
            to="/interception"
            className="inline-flex items-center gap-1.5 bg-primary text-white text-[13px] font-semibold px-3.5 py-2 rounded-lg shadow-soft hover:bg-on-primary-container active:scale-[0.98] transition-all"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New Campaign</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
