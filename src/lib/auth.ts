// ============================================================
// OPERIS — lib/auth.ts
// Helper pour récupérer l'utilisateur depuis une API Route
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { Database } from '@/types/database'

export async function getUserFromRequest(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null

    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    return user.id
  } catch {
    return null
  }
}

// Réponse 401 standard
export function unauthorized() {
  return Response.json({ success: false, error: 'Non autorisé' }, { status: 401 })
}
