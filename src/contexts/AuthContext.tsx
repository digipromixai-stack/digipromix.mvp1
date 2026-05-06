import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let prevUserId: string | null = null

    // getSession() automatically exchanges the hash token from the URL
    // (e.g. after email confirmation: /dashboard#access_token=...)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) ensureProfile(session)
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

      if (session) ensureProfile(session)
      setSession(session)
      prevUserId = newUserId
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [queryClient])

  async function signOut() {
    await supabase.auth.signOut()
    queryClient.clear()
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
