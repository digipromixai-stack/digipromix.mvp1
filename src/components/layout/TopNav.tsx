import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../ui/Button'
import { LogOut, User } from 'lucide-react'
import { AlertBell } from '../alerts/AlertBell'

export function TopNav() {
  const { user, signOut } = useAuth()

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 z-20">
      {/* Spacer for hamburger button on mobile */}
      <div className="w-10 lg:hidden" />
      <div className="flex-1" />
      <div className="flex items-center gap-2 sm:gap-3">
        <AlertBell />
        <div className="hidden sm:flex items-center gap-2 text-sm text-gray-700">
          <User size={16} className="text-gray-400" />
          <span className="max-w-[180px] truncate">{user?.email}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut size={16} />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  )
}
