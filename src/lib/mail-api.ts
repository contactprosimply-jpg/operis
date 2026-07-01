import type { Email, EmailLabel } from '@/types/database'

export const EMAIL_LIST_FIELDS_LEGACY =
  'id, user_id, message_id, subject, from_address, to_address, cc_address, bcc_address, received_at, is_read, is_ao, ao_score, tender_id, has_attachments, created_at'

/** Sans colonnes migration 025 (ao_detection / threading). */
export const EMAIL_LIST_FIELDS_STANDARD =
  'id, user_id, message_id, subject, from_address, to_address, cc_address, bcc_address, received_at, is_read, is_ao, ao_score, tender_id, has_attachments, source_member_id, source_member_name, priority, labels, mail_folder, imap_uid, imap_mailbox, is_starred, deleted_at, original_folder, created_at'

export const EMAIL_LIST_FIELDS =
  `${EMAIL_LIST_FIELDS_STANDARD.replace(', tender_id', ', is_ao_related, ao_detection_score, ao_detection_category, ao_detection_keywords, thread_id, tender_id')}`

export function isMissingDbColumnError(message: string): boolean {
  return /column .* does not exist/i.test(message) || /Could not find the .* column/i.test(message)
}

export const TENDER_STATUS_COLORS: Record<string, string> = {
  nouveau: '#60a5fa',
  en_cours: '#60a5fa',
  urgence: '#fbbf24',
  gagne: '#4ade80',
  perdu: '#f87171',
  cloture: '#6b7280',
}

export const PRESET_EMAIL_LABELS: EmailLabel[] = [
  { id: 'urgent-label', name: 'Urgent', color: '#ef4444' },
  { id: 'a-traiter', name: 'À traiter', color: '#f59e0b' },
  { id: 'repondu', name: 'Répondu', color: '#4ade80' },
  { id: 'en-attente', name: 'En attente', color: '#60a5fa' },
  { id: 'transfere', name: 'Transféré', color: '#8b5cf6' },
  { id: 'en-retard', name: 'En retard', color: '#f97316' },
  { id: 'archive', name: 'Archivé', color: '#6b7280' },
  { id: 'indesirable', name: 'Indésirable', color: '#ef4444' },
  { id: 'corbeille', name: 'Corbeille', color: '#94a3b8' },
]

/** Touches 1–9 → étiquette prédéfinie (comme Thunderbird). */
export function emailLabelForShortcutKey(key: string): EmailLabel | null {
  if (key.length !== 1 || key < '1' || key > '9') return null
  return PRESET_EMAIL_LABELS[key.charCodeAt(0) - 49] ?? null
}

export function emailLabelShortcutDigit(index: number): string {
  return String(index + 1)
}

export function tenderAutoLabel(tenderId: string, title: string, status: string): EmailLabel {
  return {
    id: `ao-${tenderId}`,
    name: title.slice(0, 40),
    color: TENDER_STATUS_COLORS[status] ?? '#60a5fa',
  }
}

export function mergeLabels(existing: EmailLabel[] | undefined, label: EmailLabel): EmailLabel[] {
  const list = existing ?? []
  if (list.some(l => l.id === label.id)) return list
  return [...list, label]
}

export function toListEmail(row: Partial<Email> & Pick<Email, 'id'>): Email {
  return {
    ...row,
    body_text: null,
    body_html: null,
    attachments: undefined,
  } as Email
}
