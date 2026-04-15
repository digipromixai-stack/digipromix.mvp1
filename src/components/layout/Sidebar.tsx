import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Building2, Activity, Bell, Settings, TrendingUp, BarChart2 } from 'lucide-react'
import { cn } from '../../lib/utils'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/competitors',icon: Building2,       label: 'Competitors' },
  { to: '/timeline',   icon: Activity,        label: 'Timeline' },
  { to: '/analytics',  icon: BarChart2,       label: 'Analytics' },
  { to: '/alerts',     icon: Bell,            label: 'Alerts' },
  { to: '/settings',   icon: Settings,        label: 'Settings' },
]

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gray-900 text-white flex flex-col z-30">
      <div className="flex items-center gap-2.5 px-6 h-16 border-b border-gray-800">
        <TrendingUp size={22} className="text-blue-400" />
        <span className="text-lg font-bold tracking-tight">Digipromix</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 px-3">v1.0 MVP</p>
      </div>
    </aside>
  )
}
