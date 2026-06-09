export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { searchParams } = new URL(req.url)
  const isAo = searchParams.get('ao') === 'true' ? true
             : searchParams.get('ao') === 'false' ? false
             : undefined
  const isRead = searchParams.get('unread') === 'true' ? false : undefined
  const hasAttachments = searchParams.get('attachments') === 'true' ? true : undefined
  const tenderId = searchParams.get('tender_id') || undefined

  const db = createAdminClient()

  let query = db
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .order('received_at', { ascending: false })
    .limit(150)

  if (isAo !== undefined) query = query.eq('is_ao', isAo)
  if (isRead !== undefined) query = query.eq('is_read', isRead)
  if (hasAttachments) query = query.eq('has_attachments', true)
  if (tenderId) query = query.eq('tender_id', tenderId)

  const { data, error } = await query
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const { id, is_read, ids } = body

  const db = createAdminClient()

  if (ids && Array.isArray(ids)) {
    const { error } = await db
      .from('emails')
      .update({ is_read: is_read ?? true })
      .eq('user_id', userId)
      .in('id', ids)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
    return Response.json({ success: true, data: { updated: ids.length } })
  }

  if (!id) {
    return Response.json({ success: false, error: 'id requis' }, { status: 400 })
  }

  const { data, error } = await db
    .from('emails')
    .update({ is_read: is_read ?? true })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}
