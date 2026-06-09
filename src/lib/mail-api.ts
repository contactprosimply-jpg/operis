import type { Email } from '@/types/database'
import { toAttachmentMeta } from '@/lib/mail-attachments'

export const EMAIL_LIST_FIELDS =
  'id, user_id, message_id, subject, from_address, to_address, received_at, is_read, is_ao, ao_score, tender_id, has_attachments, attachments, created_at'

export function toListEmail(row: Email & { attachments?: unknown }): Email {
  const attachments = toAttachmentMeta(row.attachments)
  return {
    ...row,
    body_text: undefined,
    body_html: undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  }
}
