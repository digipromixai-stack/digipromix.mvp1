import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Note: Using untyped client — all queries use explicit type casts defined in types/database.types.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Wrapper around functions.invoke that always attaches the current session token.
// supabase.functions.invoke in v2 uses headers set at construction time and does
// not dynamically re-read the session, causing 401s for authenticated users.
export async function invokeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: Error | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token ?? supabaseAnonKey
  return supabase.functions.invoke<T>(name, {
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
}
