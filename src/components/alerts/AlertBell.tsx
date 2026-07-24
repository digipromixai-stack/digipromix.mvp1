import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { AlertDropdown } from './AlertDropdown'

export function AlertBell() {
  const { businessId } = useAuth()
  const [open, setOpen] = useState(false)

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['alerts', 'unread_count', businessId],
    queryFn: async () => {
      const { count } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', businessId!)
        .eq('channel', 'dashboard')
        .eq('status', 'pending')
      return count ?? 0
    },
    enabled: !!businessId,
    refetchInterval: 30000,
  })

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-[34px] h-[34px] rounded-lg border border-border-subtle bg-surface-card flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:border-outline-variant transition-colors"
        aria-label="Notifications"
      >
        <Bell size={16} className={unreadCount > 0 ? 'animate-pulse-soft' : ''} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-danger text-white text-[10px] font-bold ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && <AlertDropdown onClose={() => setOpen(false)} />}
    </div>
  )
}
