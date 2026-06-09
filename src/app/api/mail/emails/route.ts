export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { EMAIL_LIST_FIELDS, toListEmail } from '@/lib/mail-api'

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
    .select(EMAIL_LIST_FIELDS)
    .eq('user_id', userId)
    .order('received_at', { ascending: false })
    .limit(Math.min(Number(searchParams.get('limit') || 250), 500))

  if (isAo !== undefined) query = query.eq('is_ao', isAo)
  if (isRead !== undefined) query = query.eq('is_read', isRead)
  if (hasAttachments) query = query.eq('has_attachments', true)
  if (tenderId) query = query.eq('tender_id', tenderId)

  const { data, error } = await query
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data: (data ?? []).map(toListEmail) })
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const { id, is_read, is_ao, ao_score, ids } = body

  const db = createAdminClient()

  if (ids && Array.isArray(ids)) {
    const patch: Record<string, unknown> = {}
    if (is_read !== undefined) patch.is_read = is_read
    if (is_ao !== undefined) patch.is_ao = is_ao
    if (ao_score !== undefined) patch.ao_score = ao_score
    if (!Object.keys(patch).length) patch.is_read = true

    const { error } = await db
      .from('emails')
      .update(patch)
      .eq('user_id', userId)
      .in('id', ids)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
    return Response.json({ success: true, data: { updated: ids.length } })
  }

  if (!id) {
    return Response.json({ success: false, error: 'id requis' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (is_read !== undefined) patch.is_read = is_read
  if (is_ao !== undefined) patch.is_ao = is_ao
  if (ao_score !== undefined) patch.ao_score = ao_score
  if (!Object.keys(patch).length) patch.is_read = true

  const { data, error } = await db
    .from('emails')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}
