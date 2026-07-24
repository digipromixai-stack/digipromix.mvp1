import { NavLink } from 'react-router-dom'
import { X, LogOut } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../contexts/AuthContext'

type NavItem = {
  to: string
  icon: string
  label: string
  highlight?: boolean
  badge?: string
}

type NavSection = {
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Intelligence',
    items: [
      { to: '/dashboard',     icon: 'payments',       label: 'Command Center'  },
      { to: '/opportunities', icon: 'insights',        label: 'Opportunities',  highlight: true, badge: 'AI' },
      { to: '/interception',  icon: 'bolt',            label: 'Counter Campaign' },
    ],
  },
  {
    label: 'Monitor',
    items: [
      { to: '/competitors',   icon: 'compare_arrows',  label: 'Competitors'    },
      { to: '/timeline',      icon: 'monitoring',      label: 'Change History' },
    ],
  },
  {
    label: 'Campaigns',
    items: [
      { to: '/campaigns',     icon: 'auto_awesome',    label: 'Campaigns'         },
      { to: '/leads',         icon: 'person_search',   label: 'Potential Customers' },
      { to: '/clients',       icon: 'work',            label: 'Clients'           },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/analytics',     icon: 'analytics',       label: 'Analytics'  },
      { to: '/alerts',        icon: 'notifications',   label: 'Alerts'     },
      { to: '/team',          icon: 'group',           label: 'Team'       },
      { to: '/settings',      icon: 'settings',        label: 'Settings'   },
    ],
  },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, signOut } = useAuth()
  const initials = (user?.email ?? '?').split('@')[0].slice(0, 2).toUpperCase()

  return (
    <>
      {/* Overlay (mobile) */}
      {open && (
        <div
          className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 z-40 flex flex-col',
          'bg-ink text-[#EAF3EE]',
          'transition-transform duration-300 ease-out',
          'shadow-soft-xl lg:shadow-none',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 py-[22px] border-b border-white/10">
          <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-primary to-warning flex items-center justify-center font-display font-bold text-ink text-[15px] shrink-0">
            D
          </div>
          <div className="min-w-0">
            <div className="font-display font-semibold text-[16.5px] leading-none tracking-wide truncate">DigiPromix AI</div>
            <div className="text-[10px] uppercase tracking-widest text-[#9C9AC2] mt-0.5">AI Decision Engine</div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden ml-auto p-1.5 rounded-md text-[#9C9AC2] hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-3.5 space-y-1">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-2.5 pt-3.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-[#6E6B8C]">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ to, icon, label, highlight, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13.6px] font-medium transition-all duration-150',
                        isActive
                          ? 'bg-primary/[0.28] text-white'
                          : highlight
                            ? 'text-brand-300 hover:bg-white/[0.06] hover:text-white'
                            : 'text-[#C9C6E0] hover:bg-white/[0.06] hover:text-white',
                      )
                    }
                  >
                    <span className="material-symbols-outlined text-[18px] opacity-90">{icon}</span>
                    <span className="flex-1">{label}</span>
                    {badge && (
                      <span className="text-[10.5px] font-bold px-1.5 py-px rounded-full bg-warning text-ink">
                        {badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User chip */}
        <div className="p-3.5 border-t border-white/10">
          <div className="flex items-center gap-2.5 p-2 rounded-xl">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-primary text-white text-xs font-semibold shrink-0">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.8px] font-semibold text-white truncate">{user?.email}</div>
              <div className="text-[11px] text-[#9C9AC2]">Signed in</div>
            </div>
            <button
              onClick={signOut}
              className="p-1.5 rounded-md text-[#9C9AC2] hover:text-white hover:bg-white/10 transition-colors shrink-0"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
