import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
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
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // getSession() automatically exchanges the hash token from the URL
    // (e.g. after email confirmation: /dashboard#access_token=...)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) ensureProfile(session)
      setSession(session)
      setLoading(false)
    })

    // Listen for auth state changes (login, logout, token refresh, email confirm)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) ensureProfile(session)
      setSession(session)
      // Clear loading on any auth event in case getSession was slow
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
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
