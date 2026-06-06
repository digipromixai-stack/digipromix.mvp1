import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Activity, Bell, Settings, BarChart2, Menu, X, Rocket, Zap, Users, Briefcase, Target } from 'lucide-react'
import { cn } from '../../lib/utils'

const navItems = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'AI Home'              },
  { to: '/opportunities', icon: Target,          label: 'Opportunities', highlight: true, badge: 'AI' },
  { to: '/interception',  icon: Zap,             label: 'Counter Campaign'     },
  { to: '/competitors',   icon: Building2,       label: 'Competitors'          },
  { to: '/timeline',      icon: Activity,        label: 'Change History'       },
  { to: '/campaigns',     icon: Rocket,          label: 'Campaigns'            },
  { to: '/leads',         icon: Users,           label: 'Potential Customers'  },
  { to: '/clients',       icon: Briefcase,       label: 'Clients'              },
  { to: '/analytics',     icon: BarChart2,       label: 'Analytics'            },
  { to: '/alerts',        icon: Bell,            label: 'Alerts'               },
  { to: '/settings',      icon: Settings,        label: 'Settings'             },
] as const

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
            <img src="/logo.svg" alt="DigiPromix AI" className="w-8 h-8 rounded-lg object-contain" />
            <span className="text-lg font-bold tracking-tight">DigiPromix <span className="text-blue-400">AI</span></span>
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
          {navItems.map((item) => {
            const { to, icon: Icon, label } = item
            const highlight = 'highlight' in item ? item.highlight : false
            const badge     = 'badge'     in item ? item.badge     : undefined
            return (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-soft-md'
                      : highlight
                        ? 'text-violet-300 hover:bg-violet-500/10 hover:text-violet-200'
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
                    <span className="flex-1">{label}</span>
                    {badge && (
                      <span className={cn(
                        'text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider',
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white',
                      )}>
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

      </aside>
    </>
  )
}
