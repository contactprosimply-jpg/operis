'use client'

import { createBrowserClient } from "@supabase/ssr"

const getClient = () => createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const supabase = typeof window !== 'undefined' 
  ? getClient() 
  : null as any

export function createAdminClient() {
  const { createClient } = require("@supabase/supabase-js")
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getCurrentUser() {
  if (typeof window === 'undefined') return null
  const client = getClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return null
  return user
}