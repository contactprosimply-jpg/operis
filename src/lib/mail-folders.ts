import type { Email, EmailLabel } from '@/types/database'

export type MailFolderKind = 'inbox' | 'drafts' | 'sent' | 'spam' | 'trash' | 'custom'

/** Sélection sidebar : dossier standard ou dossier IMAP personnalisé */
export type MailFolderSelection =
  | { kind: MailFolderKind; customPath?: undefined }
  | { kind: 'custom'; customPath: string }

export type MailFolder = MailFolderKind

export const STANDARD_FOLDERS: MailFolderKind[] = ['inbox', 'drafts', 'sent', 'spam', 'trash']

export const FOLDER_LABELS: Record<MailFolderKind, string> = {
  inbox: 'Courrier entrant',
  drafts: 'Brouillons',
  sent: 'Envoyés',
  spam: 'Indésirables',
  trash: 'Corbeille',
  custom: 'Dossier',
}

export const SPAM_LABEL: EmailLabel = { id: 'indesirable', name: 'Indésirable', color: '#ef4444' }
export const TRASH_LABEL: EmailLabel = { id: 'corbeille', name: 'Corbeille', color: '#94a3b8' }

export function hasLabel(email: Email, labelId: string) {
  return (email.labels ?? []).some(l => l.id === labelId)
}

export function folderSelectionKey(sel: MailFolderSelection): string {
  return sel.kind === 'custom' ? `custom:${sel.customPath}` : sel.kind
}

export function parseFolderKey(key: string): MailFolderSelection {
  if (key.startsWith('custom:')) {
    return { kind: 'custom', customPath: key.slice(7) }
  }
  const kind = key as MailFolderKind
  if (STANDARD_FOLDERS.includes(kind) || kind === 'custom') return { kind }
  return { kind: 'inbox' }
}

export function customFolderLabel(path: string): string {
  const leaf = path.split(/[./]/).pop() ?? path
  return leaf.charAt(0).toUpperCase() + leaf.slice(1)
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

export interface CachedImapFolder {
  path: string
  name: string
}
