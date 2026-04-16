import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import { useRealtimeAlerts } from '../../hooks/useRealtimeAlerts'

export function AppLayout() {
  useRealtimeAlerts()

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <TopNav />
      {/* No left margin on mobile (sidebar is overlay), ml-64 on desktop */}
      <main className="lg:ml-64 pt-16 min-h-screen">
        <div className="p-4 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
