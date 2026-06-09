import type { Email } from '@/types/database'

export const EMAIL_LIST_FIELDS =
  'id, user_id, message_id, subject, from_address, to_address, received_at, is_read, is_ao, ao_score, tender_id, has_attachments, created_at'

export function toListEmail(row: Partial<Email> & Pick<Email, 'id'>): Email {
  return {
    ...row,
    body_text: null,
    body_html: null,
    attachments: undefined,
  } as Email
}
