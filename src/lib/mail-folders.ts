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

export interface FolderTreeNode {
  path: string
  name: string
  children: FolderTreeNode[]
}

export function detectPathDelimiter(paths: string[]): '.' | '/' {
  let slashCount = 0
  let dotCount = 0
  for (const p of paths) {
    slashCount += (p.match(/\//g) ?? []).length
    dotCount += (p.match(/\./g) ?? []).length
  }
  return slashCount > dotCount ? '/' : '.'
}

function parentPath(path: string, delimiter: string): string | null {
  const idx = path.lastIndexOf(delimiter)
  if (idx <= 0) return null
  return path.slice(0, idx)
}

export function buildFolderTree(folders: CachedImapFolder[]): FolderTreeNode[] {
  if (!folders.length) return []
  const paths = folders.map(f => f.path)
  const delimiter = detectPathDelimiter(paths)
  const pathSet = new Set(paths)
  const nodeMap = new Map<string, FolderTreeNode>()

  for (const f of folders) {
    nodeMap.set(f.path, { path: f.path, name: f.name, children: [] })
  }

  const roots: FolderTreeNode[] = []
  for (const f of folders) {
    const node = nodeMap.get(f.path)!
    const parent = parentPath(f.path, delimiter)
    if (parent && pathSet.has(parent) && nodeMap.has(parent)) {
      nodeMap.get(parent)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

export function joinMailboxPath(parent: string | undefined, name: string, delimiter: string): string {
  const safeName = name.trim().replace(/[./\\]/g, '_')
  if (!parent?.trim()) return safeName
  const delim = parent.endsWith(delimiter) ? '' : delimiter
  return `${parent}${delim}${safeName}`
}
