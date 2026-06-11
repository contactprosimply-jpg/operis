export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { EMAIL_LIST_FIELDS, mergeLabels, tenderAutoLabel, toListEmail } from '@/lib/mail-api'
import type { EmailLabel } from '@/types/database'
import { getMailUserScope } from '@/lib/mail-access'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { searchParams } = new URL(req.url)
  const isAo = searchParams.get('ao') === 'true' ? true
             : searchParams.get('ao') === 'false' ? false
             : undefined
  const isRead = searchParams.get('unread') === 'true' ? false : undefined
  const hasAttachments = searchParams.get('attachments') === 'true' ? true : undefined
  const unlinked = searchParams.get('unlinked') === 'true'
  const tenderId = searchParams.get('tender_id') || undefined
  const view = searchParams.get('view') || 'mine'
  const memberId = searchParams.get('member_id') || undefined
  const priority = searchParams.get('priority') || undefined
  const fromQuery = searchParams.get('from')?.trim() || undefined
  const since = searchParams.get('since') || undefined
  const until = searchParams.get('until') || undefined
  const labelFilter = searchParams.get('label')?.trim() || undefined
  const sourceMemberId = searchParams.get('source_member_id') || undefined

  const scope = await getMailUserScope(userId)
  const db = createAdminClient()

  let query = db
    .from('emails')
    .select(EMAIL_LIST_FIELDS)
    .order('received_at', { ascending: false })
    .limit(Math.min(Number(searchParams.get('limit') || 250), 500))

  if (view === 'team' && scope.isOwner) {
    query = query.in('user_id', scope.allowedUserIds)
  } else if (memberId && scope.isOwner && scope.allowedUserIds.includes(memberId)) {
    query = query.eq('user_id', memberId)
  } else {
    query = query.eq('user_id', userId)
  }

  if (isAo !== undefined) query = query.eq('is_ao', isAo)
  if (isRead !== undefined) query = query.eq('is_read', isRead)
  if (hasAttachments) query = query.eq('has_attachments', true)
  if (unlinked) query = query.is('tender_id', null)
  if (tenderId) query = query.eq('tender_id', tenderId)
  if (priority && ['urgent', 'normal', 'info'].includes(priority)) {
    query = query.eq('priority', priority)
  }
  if (fromQuery) query = query.ilike('from_address', `%${fromQuery}%`)
  if (since) query = query.gte('received_at', since)
  if (until) query = query.lte('received_at', until)
  if (labelFilter) query = query.contains('labels', [{ name: labelFilter }] as EmailLabel[])
  if (sourceMemberId && scope.isOwner) {
    if (sourceMemberId === 'owner') {
      query = query.eq('user_id', userId).is('source_member_id', null)
    } else if (scope.allowedUserIds.includes(sourceMemberId)) {
      query = query.eq('source_member_id', sourceMemberId)
    }
  }

  const { data, error } = await query
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  return Response.json({ success: true, data: (data ?? []).map(toListEmail) })
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const { id, is_read, is_ao, ao_score, tender_id, ids, priority, labels } = body

  const scope = await getMailUserScope(userId)
  const db = createAdminClient()

  const buildPatch = (): Record<string, unknown> => {
    const patch: Record<string, unknown> = {}
    if (is_read !== undefined) patch.is_read = is_read
    if (is_ao !== undefined) patch.is_ao = is_ao
    if (ao_score !== undefined) patch.ao_score = ao_score
    if (tender_id !== undefined) patch.tender_id = tender_id
    if (priority !== undefined && ['urgent', 'normal', 'info'].includes(priority)) {
      patch.priority = priority
    }
    if (labels !== undefined) patch.labels = labels
    if (!Object.keys(patch).length) patch.is_read = true
    return patch
  }

  if (ids && Array.isArray(ids)) {
    const patch = buildPatch()
    const { error } = await db
      .from('emails')
      .update(patch)
      .in('user_id', scope.allowedUserIds)
      .in('id', ids)
    if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
    return Response.json({ success: true, data: { updated: ids.length } })
  }

  if (!id) {
    return Response.json({ success: false, error: 'id requis' }, { status: 400 })
  }

  let tenderForLabel: { id: string; title: string; status: string } | null = null
  if (tender_id !== undefined && tender_id !== null) {
    const { data: tender } = await db
      .from('tenders')
      .select('id, title, status')
      .eq('id', tender_id)
      .eq('user_id', userId)
      .maybeSingle()
    if (!tender) {
      return Response.json({ success: false, error: 'AO introuvable' }, { status: 404 })
    }
    tenderForLabel = tender
  }

  const patch = buildPatch()

  if (tenderForLabel && labels === undefined) {
    const { data: current } = await db
      .from('emails')
      .select('labels')
      .eq('id', id)
      .in('user_id', scope.allowedUserIds)
      .maybeSingle()
    patch.labels = mergeLabels(
      (current?.labels as EmailLabel[] | undefined) ?? [],
      tenderAutoLabel(tenderForLabel.id, tenderForLabel.title, tenderForLabel.status),
    )
  }

  const { data, error } = await db
    .from('emails')
    .update(patch)
    .eq('id', id)
    .in('user_id', scope.allowedUserIds)
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}
