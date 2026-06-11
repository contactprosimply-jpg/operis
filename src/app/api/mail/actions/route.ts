export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { resolveMailAccount } from '@/lib/mail-sync'
import {
  emptyTrashOnServer,
  markNotSpam,
  moveEmailOnServer,
  pushReadStateToImap,
  restoreEmailFromTrash,
  type FolderTarget,
} from '@/lib/mail-folder-actions'
import type { MailFolderKind } from '@/lib/mail-folders'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const action = body?.action as string
  const emailId = body?.emailId as string | undefined
  const account = await resolveMailAccount(userId)
  if (!account) {
    return Response.json({ success: false, error: 'Compte mail non configuré' }, { status: 400 })
  }

  const db = createAdminClient()

  if (action === 'empty_trash') {
    const { deleted } = await emptyTrashOnServer(db, userId, account)
    return Response.json({ success: true, data: { deleted } })
  }

  if (!emailId) {
    return Response.json({ success: false, error: 'emailId requis' }, { status: 400 })
  }

  if (action === 'move') {
    const target = body?.target as string
    const customPath = body?.customPath as string | undefined
    let folderTarget: FolderTarget
    if (target === 'custom' && customPath) {
      folderTarget = { kind: 'custom', imapPath: customPath }
    } else if (['inbox', 'sent', 'drafts', 'trash', 'spam'].includes(target)) {
      folderTarget = { kind: target as Exclude<MailFolderKind, 'custom'> }
    } else {
      return Response.json({ success: false, error: 'Cible invalide' }, { status: 400 })
    }
    const result = await moveEmailOnServer(db, userId, emailId, folderTarget, account)
    if (!result.success) return Response.json({ success: false, error: result.error }, { status: 400 })
    return Response.json({ success: true })
  }

  if (action === 'restore') {
    const result = await restoreEmailFromTrash(db, userId, emailId, account)
    if (!result.success) return Response.json({ success: false, error: result.error }, { status: 400 })
    return Response.json({ success: true })
  }

  if (action === 'not_spam') {
    const result = await markNotSpam(db, userId, emailId, account)
    if (!result.success) return Response.json({ success: false, error: result.error }, { status: 400 })
    return Response.json({ success: true })
  }

  if (action === 'star') {
    const starred = body?.starred === true
    await db.from('emails').update({ is_starred: starred }).eq('id', emailId).eq('user_id', userId)
    return Response.json({ success: true, data: { is_starred: starred } })
  }

  if (action === 'read') {
    const isRead = body?.is_read !== false
    const { data: email } = await db
      .from('emails')
      .select('imap_uid, imap_mailbox')
      .eq('id', emailId)
      .eq('user_id', userId)
      .single()
    await db.from('emails').update({ is_read: isRead }).eq('id', emailId).eq('user_id', userId)
    if (email?.imap_uid && email.imap_mailbox) {
      await pushReadStateToImap(account, email.imap_mailbox, email.imap_uid, isRead)
    }
    return Response.json({ success: true, data: { is_read: isRead } })
  }

  return Response.json({ success: false, error: 'Action inconnue' }, { status: 400 })
}
