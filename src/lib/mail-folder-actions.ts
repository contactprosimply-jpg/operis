import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveSpecialMailboxes,
  type ResolvedMailboxes,
} from '@/lib/imap-client'
import { imapDeleteMessages, imapMoveMessage, imapSetSeen } from '@/lib/mail-imap-actions'
import type { MailAccountWithId } from '@/lib/mail-sync'
import type { MailFolderKind } from '@/lib/mail-folders'
import { applySmartLabelsToLabels } from '@/lib/mail-smart-labels'
import type { EmailLabel } from '@/types/database'

export type FolderTarget =
  | { kind: Exclude<MailFolderKind, 'custom'> }
  | { kind: 'custom'; imapPath: string }

function mailboxPathForTarget(
  mailboxes: ResolvedMailboxes,
  target: FolderTarget,
): string | null {
  if (target.kind === 'custom') return target.imapPath
  switch (target.kind) {
    case 'inbox': return mailboxes.inbox
    case 'sent': return mailboxes.sent ?? null
    case 'drafts': return mailboxes.drafts ?? null
    case 'trash': return mailboxes.trash ?? null
    case 'spam': return mailboxes.spam ?? null
    default: return null
  }
}

function dbFolderForTarget(target: FolderTarget): string {
  return target.kind === 'custom' ? 'custom' : target.kind
}

export async function moveEmailOnServer(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  target: FolderTarget,
  account: MailAccountWithId,
): Promise<{ success: boolean; error?: string }> {
  const { data: email, error } = await db
    .from('emails')
    .select('id, mail_folder, imap_uid, imap_mailbox, original_folder, labels')
    .eq('id', emailId)
    .eq('user_id', userId)
    .single()

  if (error || !email) return { success: false, error: 'Email introuvable' }

  const mailboxes = await resolveSpecialMailboxes(account)
  const destPath = mailboxPathForTarget(mailboxes, target)
  const sourcePath = email.imap_mailbox || mailboxes.inbox
  const uid = email.imap_uid

  if (uid && sourcePath && destPath && sourcePath !== destPath) {
    await imapMoveMessage(account, sourcePath, uid, destPath)
  }

  const prevFolder = email.mail_folder ?? 'inbox'
  const nextFolder = dbFolderForTarget(target)
  const patch: Record<string, unknown> = {
    mail_folder: nextFolder,
    imap_mailbox: destPath ?? email.imap_mailbox,
    deleted_at: nextFolder === 'trash' ? new Date().toISOString() : null,
  }
  if ((nextFolder === 'trash' || nextFolder === 'spam') && prevFolder !== nextFolder) {
    patch.original_folder =
      prevFolder === 'custom' && sourcePath
        ? `custom:${sourcePath}`
        : prevFolder
  }
  if (nextFolder === 'inbox' || nextFolder === 'sent' || nextFolder === 'custom') {
    patch.original_folder = null
  }

  if (nextFolder !== 'inbox') {
    patch.labels = applySmartLabelsToLabels(email.labels as EmailLabel[] | undefined, 'moved')
  }

  await db.from('emails').update(patch).eq('id', emailId)
  return { success: true }
}

export async function restoreEmailFromTrash(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  account: MailAccountWithId,
): Promise<{ success: boolean; error?: string }> {
  const { data: email } = await db
    .from('emails')
    .select('id, original_folder, imap_uid, imap_mailbox')
    .eq('id', emailId)
    .eq('user_id', userId)
    .single()

  if (!email) return { success: false, error: 'Email introuvable' }

  const orig = email.original_folder ?? 'inbox'
  const std = (['inbox', 'sent', 'drafts', 'trash', 'spam'] as const).includes(orig as 'inbox')
    ? (orig as Exclude<MailFolderKind, 'custom'>)
    : 'inbox'
  const target: FolderTarget = orig.startsWith('custom:')
    ? { kind: 'custom', imapPath: orig.slice(7) }
    : { kind: std }

  return moveEmailOnServer(db, userId, emailId, target, account)
}

export async function markNotSpam(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  account: MailAccountWithId,
): Promise<{ success: boolean; error?: string }> {
  return moveEmailOnServer(db, userId, emailId, { kind: 'inbox' }, account)
}

export async function emptyTrashOnServer(
  db: SupabaseClient,
  userId: string,
  account: MailAccountWithId,
): Promise<{ deleted: number }> {
  const mailboxes = await resolveSpecialMailboxes(account)
  const trashPath = mailboxes.trash

  const { data: rows } = await db
    .from('emails')
    .select('id, imap_uid')
    .eq('user_id', userId)
    .eq('mail_folder', 'trash')

  const uids = (rows ?? []).map(r => r.imap_uid).filter((u): u is number => typeof u === 'number')
  if (trashPath && uids.length) {
    await imapDeleteMessages(account, trashPath, uids)
  }

  const ids = (rows ?? []).map(r => r.id)
  if (ids.length) {
    await db.from('emails').delete().in('id', ids)
  }
  return { deleted: ids.length }
}

export async function pushReadStateToImap(
  account: MailAccountWithId,
  mailboxPath: string,
  uid: number,
  isRead: boolean,
): Promise<void> {
  if (!uid || !mailboxPath) return
  await imapSetSeen(account, mailboxPath, uid, isRead)
}
