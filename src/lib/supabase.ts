let _client: any = null
let _adminClient: any = null

export const supabase = new Proxy({} as any, {
  get(_: any, prop: string) {
    if (!_client) {
      const { createClient } = require('@supabase/supabase-js')
      _client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    }
    return _client[prop]
  }
})

export function createAdminClient() {
  if (!_adminClient) {
    const { createClient } = require('@supabase/supabase-js')
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _adminClient
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}