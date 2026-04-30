import { createBrowserClient } from "@supabase/ssr"

let _supabase: any = null

export function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

export const supabase = new Proxy({} as any, {
  get(_target, prop) {
    return (getSupabase() as any)[prop]
  }
})

export function createAdminClient() {
  const { createClient } = require("@supabase/supabase-js")
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getCurrentUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser()
  if (error || !user) return null
  return user
}