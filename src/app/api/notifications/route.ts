export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

// GET /api/notifications — liste (optionnel: ?unread=true)
export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const url = new URL(req.url)
  const unreadOnly = url.searchParams.get('unread') === 'true'

  let query = db
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  const { data, error } = await query
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data: data ?? [] })
}

// PATCH /api/notifications — marquer lu (body: { id } ou { all: true })
export async function PATCH(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const body = await req.json()

  if (body.all) {
    await db
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
  } else if (body.id) {
    await db
      .from('notifications')
      .update({ is_read: true })
      .eq('id', body.id)
      .eq('user_id', userId)
  }

  return Response.json({ success: true })
}
