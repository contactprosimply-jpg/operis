import type { Email, EmailAttachment } from '@/types/database'

export const EMAIL_LIST_FIELDS =
  'id, user_id, message_id, subject, from_address, to_address, received_at, is_read, is_ao, ao_score, tender_id, has_attachments, created_at'

export function stripAttachmentData(attachments: EmailAttachment[] | null | undefined): EmailAttachment[] {
  if (!attachments?.length) return []
  return attachments.map(({ filename, contentType, size, data }) => ({
    filename,
    contentType,
    size,
    hasData: !!data,
  })) as EmailAttachment[]
}

export function toListEmail(row: Email): Email {
  return {
    ...row,
    body_text: undefined,
    body_html: undefined,
    attachments: undefined,
  }
}
