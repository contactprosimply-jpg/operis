import { simpleParser } from 'mailparser'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchMessageSourceByMessageId } from '@/lib/imap-client'
import { parseMailAttachments, type StoredEmailAttachment } from '@/lib/mail-attachments'
import { isQuoteDocument } from '@/lib/document-text-extract'
import { attachmentMetaOnly, downloadAttachmentBuffer, persistAttachmentsToStorage } from '@/lib/mail-storage'
import { resolveMailAccount } from '@/lib/mail-sync'

export function isEmailIncompleteForEnrich(email: {
  body_text?: string | null
  body_html?: string | null
  has_attachments?: boolean | null
  attachments?: StoredEmailAttachment[] | null
}): boolean {
  const attachments = (email.attachments as StoredEmailAttachment[]) ?? []
  if (!email.body_text?.trim() && !email.body_html?.trim()) return true
  return attachmentsNeedReload(attachments, email.has_attachments ?? undefined)
}

const INLINE_IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i

function attachmentsNeedReload(
  attachments: StoredEmailAttachment[],
  hasAttachments?: boolean,
): boolean {
  if (hasAttachments && attachments.length === 0) return true
  const relevant = attachments.filter(
    a => !INLINE_IMAGE_EXT.test(a.filename) && !a.contentType?.startsWith('image/'),
  )
  if (!relevant.length && hasAttachments) return true
  return relevant.some(a => !a.path && !a.data)
}

async function quoteAttachmentsMissingFromStorage(
  db: SupabaseClient,
  attachments: StoredEmailAttachment[],
): Promise<boolean> {
  const docs = attachments.filter(a => isQuoteDocument(a.filename, a.contentType))
  if (!docs.length) return false
  for (const att of docs) {
    const buffer = await downloadAttachmentBuffer(db, att)
    if (!buffer?.length) return true
  }
  return false
}

/** Re-télécharge corps + PJ depuis IMAP si l'email n'a pas été enrichi (sync rapide). */
export async function reEnrichEmailIfNeeded(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  options?: { force?: boolean },
): Promise<{ bodyText: string; attachments: StoredEmailAttachment[] } | null> {
  const { data: email } = await db
    .from('emails')
    .select('id, message_id, body_text, body_html, has_attachments, attachments')
    .eq('id', emailId)
    .single()

  if (!email?.message_id) return null

  const attachments = (email.attachments as StoredEmailAttachment[]) ?? []
  const incomplete = isEmailIncompleteForEnrich(email) ||
    await quoteAttachmentsMissingFromStorage(db, attachments)

  if (!options?.force && !incomplete) return null

  const account = await resolveMailAccount(userId)
  if (!account) return null

  const source = await fetchMessageSourceByMessageId(account, email.message_id)
  if (!source) return null

  const parsed = await simpleParser(source)
  const { attachments: parsedAtts, hasAttachments } = parseMailAttachments(parsed.attachments)

  const updates: Record<string, unknown> = {}
  if (!email.body_text?.trim() || parsed.text) {
    updates.body_text = parsed.text ?? email.body_text ?? ''
    updates.body_html = parsed.html || email.body_html || ''
  }

  let savedAttachments = attachments
  if (hasAttachments && parsedAtts.length > 0) {
    savedAttachments = await persistAttachmentsToStorage(db, userId, emailId, parsedAtts)
    const meta = savedAttachments.map(attachmentMetaOnly)
    updates.attachments = meta
    updates.has_attachments = meta.length > 0
    savedAttachments = meta
  }

  if (Object.keys(updates).length) {
    await db.from('emails').update(updates).eq('id', emailId)
  }

  const bodyText = [
    parsed.text ?? '',
    email.body_text ?? '',
    email.body_html ? email.body_html.replace(/<[^>]+>/g, ' ') : '',
  ].filter(Boolean).join('\n')

  return { bodyText, attachments: savedAttachments }
}
