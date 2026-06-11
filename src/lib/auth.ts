import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

async function getAuthUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  if (!token) return null

  const admin = createAdminClient()
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return null
  return user
}

export async function getUserFromRequest(req: NextRequest): Promise<string | null> {
  try {
    const user = await getAuthUserFromRequest(req)
    return user?.id ?? null
  } catch {
    return null
  }
}

export async function getUserEmailFromRequest(req: NextRequest): Promise<string | null> {
  try {
    const user = await getAuthUserFromRequest(req)
    return user?.email ?? null
  } catch {
    return null
  }
}

export function unauthorized() {
  return Response.json({ success: false, error: 'Non autorise' }, { status: 401 })
}