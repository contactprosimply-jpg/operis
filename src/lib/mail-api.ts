import type { Email, EmailLabel } from '@/types/database'

export const EMAIL_LIST_FIELDS =
  'id, user_id, message_id, subject, from_address, to_address, received_at, is_read, is_ao, ao_score, tender_id, has_attachments, source_member_id, source_member_name, priority, labels, created_at'

export const TENDER_STATUS_COLORS: Record<string, string> = {
  nouveau: '#60a5fa',
  en_cours: '#60a5fa',
  urgence: '#fbbf24',
  gagne: '#4ade80',
  perdu: '#f87171',
  cloture: '#6b7280',
}

export const PRESET_EMAIL_LABELS: EmailLabel[] = [
  { id: 'a-traiter', name: 'À traiter', color: '#f59e0b' },
  { id: 'repondu', name: 'Répondu', color: '#4ade80' },
  { id: 'en-attente', name: 'En attente', color: '#60a5fa' },
  { id: 'archive', name: 'Archivé', color: '#6b7280' },
]

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
