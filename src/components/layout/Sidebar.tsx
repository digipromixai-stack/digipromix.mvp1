import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Activity, Bell, Settings, TrendingUp, BarChart2, Menu, X, Rocket } from 'lucide-react'
import { cn } from '../../lib/utils'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/competitors',icon: Building2,       label: 'Competitors'},
  { to: '/timeline',   icon: Activity,        label: 'Timeline'   },
  { to: '/campaigns',  icon: Rocket,          label: 'Campaigns'  },
  { to: '/analytics',  icon: BarChart2,       label: 'Analytics'  },
  { to: '/alerts',     icon: Bell,            label: 'Alerts'     },
  { to: '/settings',   icon: Settings,        label: 'Settings'   },
]

export function Sidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3.5 left-3.5 z-50 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white shadow-soft-md hover:bg-slate-800 active:scale-95 transition-all lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Overlay (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 z-40 flex flex-col',
          'bg-slate-950 text-white',
          'transition-transform duration-300 ease-out',
          'shadow-soft-xl lg:shadow-none',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Brand area */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-brand shadow-soft-md">
              <TrendingUp size={18} className="text-white" strokeWidth={2.25} />
            </span>
            <span className="text-lg font-bold tracking-tight">Digipromix</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1.5 -mr-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-soft-md'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-white/70"
                      aria-hidden="true"
                    />
                  )}
                  <Icon size={18} strokeWidth={isActive ? 2.25 : 2} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer card */}
        <div className="px-3 py-4 border-t border-white/5">
          <div className="px-3 py-3 rounded-lg bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5">
            <p className="text-[11px] uppercase tracking-wider text-blue-400 font-semibold mb-1">
              MVP · v1.0
            </p>
            <p className="text-xs text-gray-400 leading-snug">
              Watching the web while you focus on building.
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
