export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { EMAIL_LIST_FIELDS_STANDARD, isMissingDbColumnError } from '@/lib/mail-api'

const DELTA_FIELDS = `${EMAIL_LIST_FIELDS_STANDARD}, updated_at`
const DELTA_FIELDS_FALLBACK = `${EMAIL_LIST_FIELDS_STANDARD}, created_at`
const DELTA_LIMIT = 500

type FolderQueryOpts = { hasMailFolder: boolean; hasDeletedAt: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFolderFilter(q: any, folder: string | null, imapPath: string | undefined, opts: FolderQueryOpts) {
  if (!folder || !opts.hasMailFolder) return q

  if (folder === 'custom' && imapPath) {
    q = q.eq('mail_folder', 'custom').eq('imap_mailbox', imapPath)
    if (opts.hasDeletedAt) q = q.is('deleted_at', null)
    return q
  }

  if (!['inbox', 'sent', 'drafts', 'trash', 'spam'].includes(folder)) return q

  if (folder === 'inbox') {
    q = q.or('mail_folder.eq.inbox,mail_folder.is.null')
    if (opts.hasDeletedAt) q = q.is('deleted_at', null)
    return q
  }

  if (folder === 'sent') return q.eq('mail_folder', 'sent')
  if (folder === 'trash') return q.eq('mail_folder', 'trash')

  q = q.eq('mail_folder', folder)
  if (opts.hasDeletedAt && folder !== 'trash') q = q.is('deleted_at', null)
  return q
}

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since') ?? '1970-01-01T00:00:00.000Z'
  const folder = searchParams.get('folder') ?? 'inbox'
  const imapPath = searchParams.get('imap_path') || undefined
  const db = createAdminClient()

  let opts: FolderQueryOpts = { hasMailFolder: true, hasDeletedAt: true }
  let useUpdatedAt = true

  const runQuery = (fields: string, useV8: boolean) => {
    let q = db.from('emails')
      .select(fields)
      .eq('user_id', userId)
      .gt(useUpdatedAt ? 'updated_at' : 'created_at', since)
      .order(useUpdatedAt ? 'updated_at' : 'created_at', { ascending: true })
      .limit(DELTA_LIMIT)
    q = applyFolderFilter(q, folder, imapPath, opts)
    return q
  }

  let { data, error } = await runQuery(DELTA_FIELDS, true)

  if (error && isMissingDbColumnError(error.message) && /updated_at/i.test(error.message)) {
    useUpdatedAt = false
    const retry = await runQuery(DELTA_FIELDS_FALLBACK, true)
    data = retry.data
    error = retry.error
  }

  if (error && isMissingDbColumnError(error.message) && /deleted_at/i.test(error.message)) {
    opts = { ...opts, hasDeletedAt: false }
    const retry = await runQuery(
      DELTA_FIELDS.replace(', deleted_at, original_folder', ''),
      true,
    )
    data = retry.data
    error = retry.error
  }

  if (error && isMissingDbColumnError(error.message) && /mail_folder/i.test(error.message)) {
    opts = { hasMailFolder: false, hasDeletedAt: false }
    const legacy = await runQuery(
      'id, user_id, message_id, subject, from_address, to_address, received_at, is_read, is_ao, ao_score, tender_id, has_attachments, created_at',
      false,
    )
    data = legacy.data
    error = legacy.error
  }

  if (error) {
    return Response.json({ rows: [], newCursor: since, error: error.message }, { status: 500 })
  }

  if (!opts.hasMailFolder && folder && folder !== 'inbox') {
    data = []
  }

  const list = (data ?? []) as unknown as Record<string, string>[]
  const cursorField = useUpdatedAt ? 'updated_at' : 'created_at'
  const last = list.length ? list[list.length - 1] : null
  const newCursor = last?.[cursorField] ?? since

  return Response.json({ rows: list, newCursor })
}
