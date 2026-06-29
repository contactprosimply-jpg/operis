import Dexie, { type Table } from 'dexie'
import type { Email, EmailLabel, EmailPriority } from '@/types/database'
import { mailMatchesSearch, normalizeSearchText } from '@/lib/mail-search'
import { folderSelectionKey, type MailFolderSelection } from '@/lib/mail-folders'

export interface CachedEmail {
  id: string
  user_id: string
  mail_folder: string
  folder: string
  imap_mailbox?: string | null
  from_address: string
  to_address: string
  subject: string
  snippet: string
  received_at: string
  updated_at: string
  is_read: boolean
  is_starred: boolean
  body_html?: string | null
  body_text?: string | null
  is_ao: boolean
  ao_score: number
  is_ao_related?: boolean
  has_attachments?: boolean
  priority?: string
  tender_id?: string | null
  labels_json?: string
  deleted_at?: string | null
  created_at: string
  /** @deprecated compat v1 */
  folder_key?: string
}

class MailDB extends Dexie {
  emails!: Table<CachedEmail, string>

  constructor() {
    super('operis-mail')
    this.version(1).stores({
      emails: 'id, user_id, [folder_key+received_at], received_at, updated_at, is_read, is_starred, from_address',
    })
    this.version(2).stores({
      emails: 'id, user_id, [folder+received_at], received_at, updated_at, is_read, is_starred',
    }).upgrade(async tx => {
      await tx.table('emails').toCollection().modify((row: CachedEmail) => {
        if (!row.folder) row.folder = row.folder_key ?? row.mail_folder ?? 'inbox'
        if (!row.snippet) row.snippet = makeSnippet(row.subject, row.body_text, row.body_html)
      })
    })
  }
}

export const mailDB = new MailDB()

export const norm = normalizeSearchText

function makeSnippet(subject?: string | null, bodyText?: string | null, bodyHtml?: string | null): string {
  const plain = bodyText?.trim()
    || bodyHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    || ''
  const base = plain || subject || ''
  return base.slice(0, 200)
}

export function folderKeyFromRow(
  mailFolder: string | null | undefined,
  imapMailbox?: string | null,
): string {
  if (mailFolder === 'custom' && imapMailbox) return `custom:${imapMailbox}`
  if (!mailFolder || mailFolder === 'inbox') return 'inbox'
  return mailFolder
}

export function folderKeyFromSelection(sel: MailFolderSelection): string {
  return folderSelectionKey(sel)
}

export function folderKeyToDeltaParams(folderKey: string): { folder: string; imapPath?: string } {
  if (folderKey.startsWith('custom:')) {
    return { folder: 'custom', imapPath: folderKey.slice('custom:'.length) }
  }
  return { folder: folderKey }
}

export function isLocalFirstFolder(sel: MailFolderSelection): boolean {
  return sel.kind !== 'drafts' && sel.kind !== 'custom'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function emailRowToCached(row: Record<string, any>): CachedEmail {
  const mailFolder = (row.mail_folder as string | null) ?? 'inbox'
  const imapMailbox = (row.imap_mailbox as string | null | undefined) ?? null
  const receivedAt = (row.received_at as string) ?? (row.created_at as string) ?? new Date().toISOString()
  const folder = folderKeyFromRow(mailFolder, imapMailbox)
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    mail_folder: mailFolder,
    folder,
    folder_key: folder,
    imap_mailbox: imapMailbox,
    from_address: String(row.from_address ?? ''),
    to_address: String(row.to_address ?? ''),
    subject: String(row.subject ?? ''),
    snippet: makeSnippet(row.subject, row.body_text, row.body_html),
    body_html: row.body_html ?? null,
    body_text: row.body_text ?? null,
    received_at: receivedAt,
    updated_at: String(row.updated_at ?? row.created_at ?? receivedAt),
    is_read: Boolean(row.is_read),
    is_starred: Boolean(row.is_starred),
    is_ao: Boolean(row.is_ao),
    ao_score: Number(row.ao_score ?? 0),
    is_ao_related: row.is_ao_related ?? undefined,
    has_attachments: row.has_attachments ?? undefined,
    priority: row.priority ?? undefined,
    tender_id: row.tender_id ?? null,
    labels_json: row.labels ? JSON.stringify(row.labels) : undefined,
    deleted_at: row.deleted_at ?? null,
    created_at: String(row.created_at ?? receivedAt),
  }
}

export function cachedToEmail(row: CachedEmail): Email {
  let labels: EmailLabel[] | undefined
  if (row.labels_json) {
    try {
      labels = JSON.parse(row.labels_json) as EmailLabel[]
    } catch {
      labels = undefined
    }
  }
  return {
    id: row.id,
    user_id: row.user_id,
    message_id: null,
    subject: row.subject || null,
    from_address: row.from_address || null,
    to_address: row.to_address || null,
    body_html: row.body_html ?? null,
    body_text: row.body_text ?? null,
    received_at: row.received_at,
    is_read: row.is_read,
    is_ao: row.is_ao,
    ao_score: row.ao_score,
    is_ao_related: row.is_ao_related,
    has_attachments: row.has_attachments,
    priority: row.priority as EmailPriority | undefined,
    tender_id: row.tender_id ?? null,
    labels,
    mail_folder: row.mail_folder,
    imap_mailbox: row.imap_mailbox,
    is_starred: row.is_starred,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
  }
}

export type MailListQueryOpts = {
  folderKey: string
  searchQuery?: string
  favoritesOnly?: boolean
  listFilter?: 'all' | 'unread' | 'ao' | 'attachments'
  priorityFilter?: string
  fromFilter?: string
  tenderFilter?: string
  labelFilter?: string
  sinceFilter?: string
  untilFilter?: string
  sortOrder?: 'asc' | 'desc'
}

export async function getCachedEmails(folder = 'inbox', limit = 50, offset = 0): Promise<CachedEmail[]> {
  try {
    return await mailDB.emails
      .where('[folder+received_at]')
      .between([folder, Dexie.minKey], [folder, Dexie.maxKey])
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray()
  } catch {
    return []
  }
}

export async function getCachedEmailById(id: string): Promise<CachedEmail | null> {
  try {
    return (await mailDB.emails.get(id)) ?? null
  } catch {
    return null
  }
}

export async function getCachedBody(id: string): Promise<Email | null> {
  try {
    const row = await mailDB.emails.get(id)
    if (!row?.body_html && !row?.body_text) return null
    return cachedToEmail(row)
  } catch {
    return null
  }
}

export async function searchCached(query: string, favoritesOnly = false): Promise<CachedEmail[]> {
  try {
    const q = norm(query)
    return await mailDB.emails
      .filter(e =>
        (!favoritesOnly || e.is_starred) &&
        (q === '' || norm(e.from_address).includes(q) || norm(e.to_address).includes(q) || norm(e.subject).includes(q)),
      )
      .reverse()
      .sortBy('received_at')
      .then(rows =>
        rows.reverse().sort((a, b) => (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0)),
      )
  } catch {
    return []
  }
}

function applyListFilters(rows: CachedEmail[], opts: MailListQueryOpts): CachedEmail[] {
  let out = rows

  if (opts.favoritesOnly) out = out.filter(e => e.is_starred)
  if (opts.searchQuery?.trim()) {
    out = out.filter(e => mailMatchesSearch(
      { subject: e.subject, from_address: e.from_address, to_address: e.to_address },
      opts.searchQuery!,
    ))
  }
  if (opts.listFilter === 'unread') out = out.filter(e => !e.is_read)
  if (opts.listFilter === 'ao') out = out.filter(e => e.is_ao)
  if (opts.listFilter === 'attachments') out = out.filter(e => e.has_attachments)
  if (opts.priorityFilter && ['urgent', 'normal', 'info'].includes(opts.priorityFilter)) {
    out = out.filter(e => e.priority === opts.priorityFilter)
  }
  if (opts.fromFilter?.trim()) {
    const f = norm(opts.fromFilter)
    out = out.filter(e => norm(e.from_address).includes(f))
  }
  if (opts.tenderFilter) out = out.filter(e => e.tender_id === opts.tenderFilter)
  if (opts.labelFilter?.trim()) {
    const lf = opts.labelFilter.trim()
    out = out.filter(e => {
      if (!e.labels_json) return false
      try {
        const labels = JSON.parse(e.labels_json) as EmailLabel[]
        return labels.some(l => l.name === lf || l.id === lf)
      } catch {
        return false
      }
    })
  }
  if (opts.sinceFilter) {
    const since = `${opts.sinceFilter}T00:00:00.000Z`
    out = out.filter(e => e.received_at >= since)
  }
  if (opts.untilFilter) {
    const until = `${opts.untilFilter}T23:59:59.999Z`
    out = out.filter(e => e.received_at <= until)
  }

  if (opts.sortOrder === 'asc') {
    out = [...out].sort((a, b) => a.received_at.localeCompare(b.received_at))
  } else if (opts.searchQuery?.trim()) {
    out = [...out].sort((a, b) => {
      const fav = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0)
      if (fav !== 0) return fav
      return b.received_at.localeCompare(a.received_at)
    })
  }

  return out
}

export async function queryCachedMailList(opts: MailListQueryOpts): Promise<CachedEmail[]> {
  try {
    const rows = await mailDB.emails
      .where('[folder+received_at]')
      .between([opts.folderKey, Dexie.minKey], [opts.folderKey, Dexie.maxKey])
      .reverse()
      .toArray()
    return applyListFilters(rows, opts)
  } catch {
    return []
  }
}

export async function queryCachedMailListPage(
  opts: MailListQueryOpts,
  limit: number,
  offset: number,
): Promise<{ rows: CachedEmail[]; hasMore: boolean }> {
  try {
    const filtered = await queryCachedMailList(opts)
    const rows = filtered.slice(offset, offset + limit)
    return { rows, hasMore: filtered.length > offset + limit }
  } catch {
    return { rows: [], hasMore: false }
  }
}

export async function upsertCached(rows: CachedEmail[]): Promise<void> {
  if (!rows.length) return
  try {
    await mailDB.emails.bulkPut(rows)
  } catch { /* ignore */ }
}

export async function setLocalFlag(
  id: string,
  patch: Partial<Pick<CachedEmail, 'is_read' | 'is_starred'>>,
): Promise<void> {
  try {
    await mailDB.emails.update(id, patch)
  } catch { /* ignore */ }
}

export async function patchCachedEmail(id: string, patch: Partial<CachedEmail>): Promise<void> {
  try {
    await mailDB.emails.update(id, patch)
  } catch { /* ignore */ }
}

export async function storeCachedBody(
  id: string,
  body: { body_html?: string | null; body_text?: string | null },
): Promise<void> {
  try {
    const snippet = makeSnippet(undefined, body.body_text, body.body_html)
    await mailDB.emails.update(id, {
      body_html: body.body_html ?? null,
      body_text: body.body_text ?? null,
      snippet,
      updated_at: new Date().toISOString(),
    })
  } catch { /* ignore */ }
}

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}
