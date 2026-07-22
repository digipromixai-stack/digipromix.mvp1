import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { OrgRole } from '../types/database.types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  /** The business this user acts as — their own id for solo users, the Owner's id for active teammates. */
  businessId: string | null
  /** The caller's role within that business. Defaults to 'owner' for solo users. */
  role: OrgRole
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function ensureProfile(session: Session) {
  try {
    await supabase.from('profiles').upsert(
      {
        id: session.user.id,
        full_name: session.user.user_metadata?.full_name ?? session.user.email ?? '',
      },
      { onConflict: 'id', ignoreDuplicates: true }
    )
  } catch {
    // Non-fatal — profile will be created next time
  }
}

// Flips any pending invite for this user to 'active', then resolves which
// business they act as and their role in it.
async function resolveBusinessContext(session: Session): Promise<{ businessId: string; role: OrgRole }> {
  try {
    await supabase.rpc('accept_pending_invites')
  } catch {
    // Non-fatal — retried on next login
  }
  const [{ data: businessId }, { data: role }] = await Promise.all([
    supabase.rpc('current_business_id'),
    supabase.rpc('current_business_role'),
  ])
  return {
    businessId: (businessId as string | null) ?? session.user.id,
    role: (role as OrgRole | null) ?? 'owner',
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [role, setRole] = useState<OrgRole>('owner')

  useEffect(() => {
    let prevUserId: string | null = null
    let cancelled = false

    function loadBusinessContext(session: Session) {
      resolveBusinessContext(session).then((ctx) => {
        if (cancelled) return
        setBusinessId(ctx.businessId)
        setRole(ctx.role)
      })
    }

    // getSession() automatically exchanges the hash token from the URL
    // (e.g. after email confirmation: /dashboard#access_token=...)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        ensureProfile(session)
        loadBusinessContext(session)
      }
      setSession(session)
      prevUserId = session?.user.id ?? null
      setLoading(false)
    })

    // Listen for auth state changes (login, logout, token refresh, email confirm)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user.id ?? null

      // SECURITY: Clear all cached data when the user changes (login, logout, switch).
      // Otherwise React Query keeps the previous user's data in memory and a different
      // user could briefly see it before fresh fetches complete.
      if (event === 'SIGNED_OUT' || (newUserId && prevUserId && newUserId !== prevUserId)) {
        queryClient.clear()
      }
      // Refetch all queries on fresh sign-in so data reflects the new user.
      if (event === 'SIGNED_IN' && newUserId !== prevUserId) {
        queryClient.invalidateQueries()
      }

      if (session) {
        ensureProfile(session)
        loadBusinessContext(session)
      } else {
        setBusinessId(null)
        setRole('owner')
      }
      setSession(session)
      prevUserId = newUserId
      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [queryClient])

  async function signOut() {
    await supabase.auth.signOut()
    queryClient.clear()
    setSession(null)
    setBusinessId(null)
    setRole('owner')
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, businessId, role, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
