export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import {
  EMAIL_LIST_FIELDS,
  EMAIL_LIST_FIELDS_LEGACY,
  isMissingDbColumnError,
  mergeLabels,
  tenderAutoLabel,
  toListEmail,
} from '@/lib/mail-api'
import type { Email, EmailLabel } from '@/types/database'
import { getMailUserScope } from '@/lib/mail-access'
import { resolveMailAccount } from '@/lib/mail-sync'
function sentListKey(subject: string | null | undefined, to: string | null | undefined, at: string | null | undefined): string {
  return `${subject ?? ''}|${to ?? ''}|${(at ?? '').slice(0, 16)}`
}

function emailLogToSentRow(
  log: { id: string; to_address: string; subject: string; body: string; sent_at: string },
  userId: string,
  fromAddress: string,
): Email {
  return {
    id: `elog-${log.id}`,
    user_id: userId,
    message_id: `elog-${log.id}`,
    subject: log.subject,
    from_address: fromAddress,
    to_address: log.to_address,
    body_text: log.body,
    body_html: null,
    received_at: log.sent_at,
    is_read: true,
    is_ao: false,
    ao_score: 0,
    tender_id: null,
    has_attachments: false,
    mail_folder: 'sent',
    created_at: log.sent_at,
  } as Email
}

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
  const priority = searchParams.get('priority') || undefined
  const fromQuery = searchParams.get('from')?.trim() || undefined
  const since = searchParams.get('since') || undefined
  const until = searchParams.get('until') || undefined
  const labelFilter = searchParams.get('label')?.trim() || undefined
  const scope = await getMailUserScope(userId)
  const db = createAdminClient()
  const limit = Math.min(Number(searchParams.get('limit') || 250), 500)
  const folder = searchParams.get('folder')
  const sentFolder = folder === 'sent'
  const mailAccount = sentFolder ? await resolveMailAccount(userId) : null

  const applyFilters = (
    query: ReturnType<typeof db.from>,
    fields: string,
    useV8Filters: boolean,
    useFolderColumn = true,
  ) => {
    let q = query
      .select(fields)
      .order('received_at', { ascending: false })
      .limit(limit)

    q = q.eq('user_id', userId)

    if (folder && ['inbox', 'sent', 'drafts', 'trash', 'spam'].includes(folder)) {
      if (folder === 'inbox' && useFolderColumn) {
        q = q.or('mail_folder.eq.inbox,mail_folder.is.null')
      } else if (folder === 'sent' && useFolderColumn) {
        q = q.or('mail_folder.eq.sent,imap_mailbox.ilike.%Sent%,imap_mailbox.ilike.%Envoy%')
      } else if (useFolderColumn) {
        q = q.eq('mail_folder', folder)
      }
    }

    if (isAo !== undefined) q = q.eq('is_ao', isAo)
    if (isRead !== undefined) q = q.eq('is_read', isRead)
    if (hasAttachments) q = q.eq('has_attachments', true)
    if (unlinked) q = q.is('tender_id', null)
    if (tenderId) q = q.eq('tender_id', tenderId)
    if (useV8Filters && priority && ['urgent', 'normal', 'info'].includes(priority)) {
      q = q.eq('priority', priority)
    }
    if (fromQuery) q = q.ilike('from_address', `%${fromQuery}%`)
    if (since) q = q.gte('received_at', since)
    if (until) q = q.lte('received_at', until)
    if (useV8Filters && labelFilter) {
      q = q.contains('labels', [{ name: labelFilter }] as EmailLabel[])
    }
    return q
  }

  let { data, error } = await applyFilters(db.from('emails'), EMAIL_LIST_FIELDS, true, true)
  if (error && isMissingDbColumnError(error.message)) {
    const legacy = await applyFilters(db.from('emails'), EMAIL_LIST_FIELDS_LEGACY, false, false)
    data = legacy.data
    error = legacy.error
  }
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  let rows = (data ?? []) as unknown as Email[]

  if (sentFolder) {
    const fromAddress = mailAccount?.imap_user ?? ''
    const existingKeys = new Set(rows.map(r => sentListKey(r.subject, r.to_address, r.received_at)))
    const { data: logs, error: logsError } = await db
      .from('email_logs')
      .select('id, to_address, subject, body, sent_at')
      .eq('user_id', userId)
      .eq('success', true)
      .order('sent_at', { ascending: false })
      .limit(limit)

    const logRows = logsError && /user_id/i.test(logsError.message) ? [] : (logs ?? [])
    for (const log of logRows) {
      const key = sentListKey(log.subject, log.to_address, log.sent_at)
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      rows.push(emailLogToSentRow(log, userId, fromAddress))
    }

    rows.sort((a, b) => {
      const ta = a.received_at ? new Date(a.received_at).getTime() : 0
      const tb = b.received_at ? new Date(b.received_at).getTime() : 0
      return tb - ta
    })
    rows = rows.slice(0, limit)
  }

  return Response.json({
    success: true,
    data: rows.map(row => {
      const lite = toListEmail(row)
      if (String(row.id).startsWith('elog-') && row.body_text) {
        lite.body_text = row.body_text
      }
      return lite
    }),
  })
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
