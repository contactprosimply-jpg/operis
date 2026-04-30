import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

export async function getUserFromRequest(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
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

export function unauthorized() {
  return Response.json({ success: false, error: 'Non autorise' }, { status: 401 })
}