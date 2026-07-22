import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Menu, X, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'

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

export function Sidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3.5 left-3.5 z-50 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary text-white shadow-soft-md hover:brightness-110 active:scale-95 transition-all lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Overlay (mobile) */}
      {open && (
        <div
          className="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 z-40 flex flex-col py-6 px-4',
          'bg-surface-container-low border-r border-outline-variant',
          'transition-transform duration-300 ease-out',
          'shadow-soft-xl lg:shadow-none',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between mb-8 px-2">
          <div>
            <h1 className="text-lg font-bold text-primary leading-none">DigiPromix AI</h1>
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mt-1">AI Decision Engine</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1.5 -mr-1 rounded-md text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* New campaign */}
        <Link
          to="/interception"
          onClick={() => setOpen(false)}
          className="flex items-center justify-center gap-2 mb-6 px-3 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-soft"
        >
          <Plus size={16} />
          New Campaign
        </Link>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto space-y-5">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-secondary/70">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ to, icon, label, highlight, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                        isActive
                          ? 'bg-primary-container text-on-primary-container font-bold'
                          : highlight
                            ? 'text-primary hover:bg-indigo-tint'
                            : 'text-secondary hover:bg-surface-container-high',
                      )
                    }
                  >
                    <span className="material-symbols-outlined text-[20px]">{icon}</span>
                    <span className="flex-1">{label}</span>
                    {badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider bg-primary text-white">
                        {badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}
