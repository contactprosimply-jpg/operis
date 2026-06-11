import type { Email, EmailLabel } from '@/types/database'

export type MailFolder = 'inbox' | 'drafts' | 'sent' | 'spam' | 'trash'

export const SPAM_LABEL: EmailLabel = { id: 'indesirable', name: 'Indésirable', color: '#ef4444' }
export const TRASH_LABEL: EmailLabel = { id: 'corbeille', name: 'Corbeille', color: '#94a3b8' }

export function hasLabel(email: Email, labelId: string) {
  return (email.labels ?? []).some(l => l.id === labelId)
}

export function filterEmailsForFolder(emails: Email[], folder: MailFolder): Email[] {
  if (folder === 'spam') return emails.filter(e => hasLabel(e, SPAM_LABEL.id))
  if (folder === 'trash') return emails.filter(e => hasLabel(e, TRASH_LABEL.id))
  if (folder === 'inbox') {
    return emails.filter(e => !hasLabel(e, SPAM_LABEL.id) && !hasLabel(e, TRASH_LABEL.id))
  }
  return emails
}

export interface SentMailRow {
  id: string
  type: string
  to_address: string
  subject: string | null
  body: string | null
  sent_at: string
  success: boolean
}
