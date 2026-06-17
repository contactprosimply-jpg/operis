export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import type { NotificationPriority } from '@/lib/user-notifications'

export type AppNotification = {
  id: string
  user_id: string
  type: string
  priority: NotificationPriority
  title: string
  message: string
  tender_id: string | null
  supplier_id: string | null
  email_id: string | null
  is_read: boolean
  created_at: string
}

function sortNotifications(rows: AppNotification[]): AppNotification[] {
  return [...rows].sort((a, b) => {
    const pa = a.priority === 'important' ? 0 : 1
    const pb = b.priority === 'important' ? 0 : 1
    if (pa !== pb) return pa - pb
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

// GET /api/notifications — liste (+ unread_count)
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
    .limit(80)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  const { data, error } = await query
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  const rows = (data ?? []).map(row => ({
    ...row,
    priority: (row.priority === 'important' ? 'important' : 'normal') as NotificationPriority,
    email_id: row.email_id ?? null,
  })) as AppNotification[]

  const sorted = sortNotifications(rows)

  const { count: unreadCount } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  return Response.json({
    success: true,
    data: sorted,
    unread_count: unreadCount ?? 0,
  })
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
