import { createClient } from '@supabase/supabase-js'

// Client navigateur — instancié une seule fois côté client
let _browserClient: ReturnType<typeof createClient> | null = null

export function getBrowserClient() {
  if (typeof window === 'undefined') {
    // Côté serveur — créer un client temporaire (jamais mis en cache)
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  if (!_browserClient) {
    _browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _browserClient
}

// Export compatible avec l'ancien code — proxy vers getBrowserClient()
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getBrowserClient() as any)[prop]
  }
})

// Client admin — TOUJOURS une nouvelle instance (évite les singletons serveur)
export function createAdminClient() {
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

export async function getCurrentUser() {
  const client = getBrowserClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return null
  return user
}
