import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { BLOCKED_SUPABASE_PROJECT_REFS } from '../setup'

export type TestUsers = {
  userA: { id: string; client: SupabaseClient }
  userB: { id: string; client: SupabaseClient }
  admin: SupabaseClient
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v?.trim()) throw new Error(`Variable ${name} requise pour les tests d'intégration`)
  return v.trim()
}

export function integrationConfigured(): boolean {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const aEmail = process.env.TEST_USER_A_EMAIL
  const bEmail = process.env.TEST_USER_B_EMAIL
  const aPass = process.env.TEST_USER_A_PASSWORD
  const bPass = process.env.TEST_USER_B_PASSWORD
  if (!url || !anon || !service || !aEmail || !bEmail || !aPass || !bPass) return false
  if (BLOCKED_SUPABASE_PROJECT_REFS.some(ref => url.includes(ref)) && process.env.VITEST_ALLOW_PROD !== '1') return false
  return true
}

export async function createTestClients(): Promise<TestUsers> {
  const urlRaw = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonRaw = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!urlRaw || !anonRaw) throw new Error('SUPABASE_URL et SUPABASE_ANON_KEY requis')
  const url: string = urlRaw
  const anon: string = anonRaw
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  async function signIn(email: string, password: string) {
    const client = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.user) throw new Error(`Auth failed for ${email}: ${error?.message}`)
    return { id: data.user.id, client }
  }

  const userA = await signIn(requireEnv('TEST_USER_A_EMAIL'), requireEnv('TEST_USER_A_PASSWORD'))
  const userB = await signIn(requireEnv('TEST_USER_B_EMAIL'), requireEnv('TEST_USER_B_PASSWORD'))

  return { userA, userB, admin }
}
