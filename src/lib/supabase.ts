export function createAdminClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

export function getSupabaseClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export const supabase = {
  auth: {
    getSession: () => getSupabaseClient().auth.getSession(),
    getUser: () => getSupabaseClient().auth.getUser(),
    signInWithPassword: (creds: any) => getSupabaseClient().auth.signInWithPassword(creds),
    signUp: (creds: any) => getSupabaseClient().auth.signUp(creds),
    signOut: () => getSupabaseClient().auth.signOut(),
    onAuthStateChange: (cb: any) => getSupabaseClient().auth.onAuthStateChange(cb),
  },
  channel: (name: string) => getSupabaseClient().channel(name),
  removeChannel: (channel: any) => getSupabaseClient().removeChannel(channel),
  from: (table: string) => getSupabaseClient().from(table),
}

export async function getCurrentUser() {
  const { data: { user }, error } = await getSupabaseClient().auth.getUser()
  if (error || !user) return null
  return user
}