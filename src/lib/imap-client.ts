import { ImapFlow } from 'imapflow'
import { accountEmailAliases, isFromAccountAddress } from '@/lib/mail-attachments'

export interface MailAccountConfig {
  imap_host: string
  imap_port: number
  imap_user: string
  imap_pass: string
}

export interface ImapEnvelopeMeta {
  uid: number
  messageId: string
  subject: string
  from: string
  to: string
  date: Date
  isRead: boolean
}

export interface ImapMessageSource {
  uid: number
  source: Buffer
}

export function formatImapError(e: unknown): string {
  const err = e as {
    message?: string
    responseStatus?: string
    responseText?: string
    authenticationFailed?: boolean
    executedCommand?: string
  }
  if (err.authenticationFailed) {
    return 'Identifiants IMAP incorrects — verifiez email et mot de passe dans Parametres > Messagerie'
  }
  const parts = [err.message ?? 'Erreur inconnue']
  if (err.responseStatus) parts.push(`[${err.responseStatus}]`)
  if (err.responseText) parts.push(err.responseText)
  if (err.executedCommand) parts.push(`(commande: ${err.executedCommand})`)
  return parts.join(' ')
}

export function createImapClient(config: MailAccountConfig): ImapFlow {
  const port = Number(config.imap_port) || 993
  return new ImapFlow({
    host: config.imap_host || 'mail.gandi.net',
    port,
    secure: port === 993,
    auth: {
      user: config.imap_user.trim(),
      pass: config.imap_pass,
    },
    logger: false,
    connectionTimeout: 25000,
    greetingTimeout: 25000,
    socketTimeout: 90000,
    tls: { minVersion: 'TLSv1.2' },
  })
}

function sinceDate(sinceDays: number): Date {
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)
  since.setHours(0, 0, 0, 0)
  return since
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function sinceHoursAgo(hours: number): Date {
  const d = new Date()
  d.setHours(d.getHours() - hours)
  return d
}

function formatAddressList(list?: { address?: string; name?: string }[] | null): string {
  if (!list?.length) return ''
  return list
    .map(a => {
      if (a.name && a.address) return `${a.name} <${a.address}>`
      return a.address ?? a.name ?? ''
    })
    .join(', ')
}

function normalizeDate(value?: Date | string): Date | undefined {
  if (!value) return undefined
  return value instanceof Date ? value : new Date(value)
}

function mailboxExists(client: ImapFlow): number {
  const mb = client.mailbox
  if (!mb || typeof mb === 'boolean') return 0
  return mb.exists ?? 0
}

function envelopeToMeta(
  uid: number,
  envelope: {
    messageId?: string
    subject?: string
    from?: { address?: string; name?: string }[]
    to?: { address?: string; name?: string }[]
    date?: Date
  } | undefined,
  internalDate?: Date | string,
  flags?: Set<string>,
  accountUser?: string,
): ImapEnvelopeMeta {
  const rawMid = envelope?.messageId?.trim()
  const bare = rawMid?.replace(/^<|>$/g, '') ?? ''
  const messageId = bare && bare.includes('@')
    ? `<${bare}>`
    : (rawMid || `uid-${accountUser ?? 'user'}-${uid}`)
  const internal = normalizeDate(internalDate)
  return {
    uid,
    messageId,
    subject: envelope?.subject?.trim() || '(sans objet)',
    from: formatAddressList(envelope?.from),
    to: formatAddressList(envelope?.to),
    date: envelope?.date ?? internal ?? new Date(),
    isRead: flags?.has('\\Seen') ?? false,
  }
}

function mergeEnvelopesByUid(arrays: ImapEnvelopeMeta[][]): ImapEnvelopeMeta[] {
  const map = new Map<number, ImapEnvelopeMeta>()
  for (const arr of arrays) {
    for (const m of arr) map.set(m.uid, m)
  }
  return Array.from(map.values()).sort((a, b) => a.uid - b.uid)
}

const UID_FETCH_CHUNK = 80

async function fetchEnvelopeByUidRange(
  client: ImapFlow,
  uids: number[],
  limit: number,
  accountUser: string,
): Promise<ImapEnvelopeMeta[]> {
  if (!uids.length) return []
  const sorted = [...uids].sort((a, b) => a - b)
  const targetUids = limit > 0 && sorted.length > limit ? sorted.slice(-limit) : sorted
  const messages: ImapEnvelopeMeta[] = []
  for (let i = 0; i < targetUids.length; i += UID_FETCH_CHUNK) {
    const chunk = targetUids.slice(i, i + UID_FETCH_CHUNK)
    for await (const message of client.fetch(chunk, {
      uid: true,
      envelope: true,
      internalDate: true,
      flags: true,
    }, { uid: true })) {
      messages.push(envelopeToMeta(
        message.uid,
        message.envelope,
        message.internalDate,
        message.flags,
        accountUser,
      ))
    }
  }
  return messages
}

async function fetchEnvelopeBySequence(
  client: ImapFlow,
  limit: number,
  accountUser: string,
  since?: Date,
): Promise<ImapEnvelopeMeta[]> {
  const exists = mailboxExists(client)
  if (exists === 0) return []

  const window = Math.max(limit, 60)
  const startSeq = Math.max(1, exists - window + 1)
  const messages: ImapEnvelopeMeta[] = []

  for await (const message of client.fetch(`${startSeq}:*`, {
    uid: true,
    envelope: true,
    internalDate: true,
    flags: true,
  })) {
    const internal = normalizeDate(message.internalDate)
    if (since && internal && internal < since) continue
    messages.push(envelopeToMeta(
      message.uid,
      message.envelope,
      message.internalDate,
      message.flags,
      accountUser,
    ))
  }

  return messages
    .sort((a, b) => a.uid - b.uid)
    .slice(-limit)
}

async function fetchEnvelopeBySinceStream(
  client: ImapFlow,
  since: Date,
  limit: number,
  accountUser: string,
): Promise<ImapEnvelopeMeta[]> {
  const messages: ImapEnvelopeMeta[] = []
  for await (const message of client.fetch({ since }, {
    uid: true,
    envelope: true,
    internalDate: true,
    flags: true,
  })) {
    messages.push(envelopeToMeta(
      message.uid,
      message.envelope,
      message.internalDate,
      message.flags,
      accountUser,
    ))
    if (messages.length >= limit * 2) break
  }
  return messages.sort((a, b) => a.uid - b.uid).slice(-limit)
}

export interface ResolvedMailboxes {
  inbox: string
  sent?: string
  drafts?: string
  trash?: string
  spam?: string
  custom: string[]
}

const MAILBOX_NAME_HINTS: Record<Exclude<keyof ResolvedMailboxes, 'inbox' | 'custom'>, string[]> = {
  sent: [
    'sent', 'envoyés', 'envoyes', 'éléments envoyés', 'elements envoyes',
    'sent items', 'sent messages',
  ],
  drafts: ['drafts', 'draft', 'brouillons', 'brouillon'],
  trash: ['trash', 'deleted', 'corbeille', 'supprimés', 'supprimes'],
  spam: ['junk', 'spam', 'indésirables', 'indesirables'],
}

const PROBE_MAILBOX_PATHS: Record<Exclude<keyof ResolvedMailboxes, 'inbox' | 'custom'>, string[]> = {
  sent: [
    'Sent', 'INBOX.Sent', 'INBOX/Sent', 'Envoyés', 'INBOX.Envoyés', 'INBOX/Envoyés',
    'Sent Messages', 'INBOX/Sent Messages', 'INBOX.Sent Messages',
  ],
  drafts: ['Drafts', 'INBOX.Drafts', 'INBOX/Drafts', 'Brouillons', 'INBOX/Brouillons'],
  trash: ['Trash', 'INBOX.Trash', 'INBOX/Trash', 'Corbeille', 'INBOX/Corbeille', 'Deleted'],
  spam: ['Junk', 'INBOX.Junk', 'INBOX/Junk', 'Spam', 'Indésirables', 'INBOX/Indésirables'],
}

function pathMatchesHint(path: string, hint: string): boolean {
  const lower = path.toLowerCase()
  const leaf = lower.split(/[./]/).pop() ?? lower
  const h = hint.toLowerCase()
  return leaf === h || lower.endsWith(`/${h}`) || lower.endsWith(`.${h}`)
}

/** Vérifie que le dossier contient bien des envois (pas du courrier entrant). */
async function validateSentMailboxOnClient(
  client: ImapFlow,
  mailboxPath: string,
  accountUser: string,
): Promise<boolean> {
  try {
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      const envelopes = await fetchEnvelopeBySequence(client, 10, accountUser, sinceDate(365))
      if (!envelopes.length) return true
      const aliases = accountEmailAliases(accountUser)
      const outbound = envelopes.filter(e => isFromAccountAddress(e.from, aliases)).length
      return outbound >= Math.ceil(envelopes.length / 2)
    } finally {
      lock.release()
    }
  } catch {
    return false
  }
}

async function probeMailboxPath(client: ImapFlow, path: string): Promise<boolean> {
  try {
    const lock = await client.getMailboxLock(path)
    lock.release()
    return true
  } catch {
    return false
  }
}

/** Liste tous les dossiers IMAP (diagnostic Gandi / Thunderbird). */
export async function listImapMailboxes(config: MailAccountConfig): Promise<
  Array<{ path: string; specialUse?: string; name?: string }>
> {
  const client = createImapClient(config)
  await client.connect()
  try {
    const mailboxes = await client.list()
    return mailboxes.map(m => ({
      path: m.path,
      specialUse: m.specialUse ?? undefined,
      name: m.name,
    }))
  } finally {
    try {
      await client.logout()
    } catch { /* ignore */ }
  }
}

/** Découverte des dossiers IMAP (SPECIAL-USE + noms courants Gandi/Thunderbird). */
export async function resolveSpecialMailboxes(config: MailAccountConfig): Promise<ResolvedMailboxes> {
  const client = createImapClient(config)
  await client.connect()
  try {
    const result: ResolvedMailboxes = { inbox: 'INBOX', custom: [] }
    let sentFromSpecialUse = false
    const mailboxes = await client.list()
    for (const m of mailboxes) {
      if (m.specialUse === '\\Sent') {
        result.sent = m.path
        sentFromSpecialUse = true
      }
      if (m.specialUse === '\\Drafts') result.drafts = m.path
      if (m.specialUse === '\\Trash') result.trash = m.path
      if (m.specialUse === '\\Junk') result.spam = m.path
    }
    for (const [kind, hints] of Object.entries(MAILBOX_NAME_HINTS) as Array<
      [Exclude<keyof ResolvedMailboxes, 'inbox' | 'custom'>, string[]]
    >) {
      if (result[kind]) continue
      for (const m of mailboxes) {
        if (hints.some(h => pathMatchesHint(m.path, h))) {
          result[kind] = m.path
          break
        }
      }
    }
    for (const [kind, paths] of Object.entries(PROBE_MAILBOX_PATHS) as Array<
      [Exclude<keyof ResolvedMailboxes, 'inbox' | 'custom'>, string[]]
    >) {
      if (result[kind]) continue
      for (const path of paths) {
        if (await probeMailboxPath(client, path)) {
          result[kind] = path
          break
        }
      }
    }
    if (result.sent && !sentFromSpecialUse) {
      const accountUser = config.imap_user.trim()
      const valid = await validateSentMailboxOnClient(client, result.sent, accountUser)
      if (!valid) {
        console.warn(`[IMAP] dossier "${result.sent}" ignoré — contient du courrier reçu, pas des envoyés`)
        delete result.sent
      }
    }

    const standard = new Set(
      [result.inbox, result.sent, result.drafts, result.trash, result.spam].filter(Boolean) as string[],
    )
    result.custom = mailboxes
      .filter(m => {
        const p = m.path
        if (standard.has(p) || p.toUpperCase() === 'INBOX') return false
        if (m.specialUse && ['\\Sent', '\\Drafts', '\\Trash', '\\Junk'].includes(m.specialUse)) return false
        return true
      })
      .map(m => m.path)
      .slice(0, 20)

    return result
  } finally {
    try {
      await client.logout()
    } catch {}
  }
}

async function fetchEnvelopesInOpenMailbox(
  client: ImapFlow,
  mailboxPath: string,
  accountUser: string,
  options: { sinceDays: number; limit: number; minUid?: number; fullScan?: boolean },
): Promise<ImapEnvelopeMeta[]> {
  const sinceDays = options.sinceDays
  const limit = options.limit
  const minUid = options.minUid ?? 0
  const fullScan = options.fullScan === true
  const since = sinceDate(sinceDays)
  const isInbox = mailboxPath.toUpperCase() === 'INBOX'
  const batches: ImapEnvelopeMeta[][] = []
  const mergeCap = Math.max(limit, 100)
  const uidFetchLimit = fullScan ? 0 : mergeCap

  if (!isInbox) {
    batches.push(await fetchEnvelopeBySequence(client, limit, accountUser, since))
    batches.push(await fetchEnvelopeBySinceStream(client, since, limit, accountUser))
    const merged = mergeEnvelopesByUid(batches)
    return merged.slice(-limit)
  }

  if (!fullScan) {
      // Fraîcheur : 48 h + non-lus (indépendant du last_sync_uid)
      batches.push(await fetchEnvelopeBySinceStream(client, sinceHoursAgo(48), mergeCap, accountUser))
      batches.push(await fetchEnvelopeBySinceStream(client, startOfToday(), mergeCap, accountUser))

      try {
        const unseenUids = await client.search({ seen: false }, { uid: true })
        if (Array.isArray(unseenUids) && unseenUids.length) {
          batches.push(await fetchEnvelopeByUidRange(client, unseenUids, mergeCap, accountUser))
        }
      } catch {
        /* certains serveurs IMAP ne supportent pas seen:false */
      }

      // Derniers UIDs absolus — filet de sécurité si la date interne IMAP est incorrecte
      try {
        const allUids = await client.search({ all: true }, { uid: true })
        if (Array.isArray(allUids) && allUids.length) {
          batches.push(await fetchEnvelopeByUidRange(client, allUids, Math.min(mergeCap, 80), accountUser))
        }
      } catch {
        /* search all non supporté */
      }
    }

    if (minUid > 0 && fullScan) {
      const newUids = await client.search({ uid: `${minUid + 1}:*` }, { uid: true })
      if (Array.isArray(newUids) && newUids.length) {
        batches.push(await fetchEnvelopeByUidRange(client, newUids, uidFetchLimit, accountUser))
      }
    }

    batches.push(await fetchEnvelopeBySequence(client, mergeCap, accountUser, since))

    try {
      const uids = await client.search({ since }, { uid: true })
      if (Array.isArray(uids) && uids.length) {
        batches.push(await fetchEnvelopeByUidRange(client, uids, uidFetchLimit, accountUser))
      }
    } catch {
      /* fallback sur le flux since */
    }

    batches.push(await fetchEnvelopeBySinceStream(client, since, mergeCap, accountUser))

  const merged = mergeEnvelopesByUid(batches)
  const resultCap = fullScan ? Math.max(limit, merged.length) : mergeCap
  return merged.slice(-resultCap)
}

/** Liste rapide des enveloppes (sans télécharger le corps — ~10x plus rapide). */
export async function fetchRecentEnvelopes(
  config: MailAccountConfig,
  options: {
    mailboxPath?: string
    sinceDays?: number
    limit?: number
    minUid?: number
    fullScan?: boolean
  } = {},
): Promise<ImapEnvelopeMeta[]> {
  const mailboxPath = options.mailboxPath ?? 'INBOX'
  const sinceDays = options.sinceDays ?? 30
  const limit = options.limit ?? 40
  const accountUser = config.imap_user.trim()
  const client = createImapClient(config)

  await client.connect()
  const lock = await client.getMailboxLock(mailboxPath)

  try {
    return await fetchEnvelopesInOpenMailbox(client, mailboxPath, accountUser, {
      sinceDays,
      limit,
      minUid: options.minUid ?? 0,
      fullScan: options.fullScan === true,
    })
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {}
  }
}

/** Télécharge le source brut d'un email via son Message-ID (ré-enrichissement). */
export async function fetchMessageSourceByMessageId(
  config: MailAccountConfig,
  messageId: string,
  mailboxPath = 'INBOX',
): Promise<Buffer | null> {
  const bare = messageId.replace(/^<|>$/g, '')
  const candidates = [messageId, `<${bare}>`, bare]

  const client = createImapClient(config)
  await client.connect()
  const lock = await client.getMailboxLock(mailboxPath)

  try {
    let uid: number | undefined
    for (const mid of candidates) {
      const uids = await client.search({ header: { 'message-id': mid } }, { uid: true })
      if (Array.isArray(uids) && uids.length) {
        uid = uids[uids.length - 1]
        break
      }
    }
    if (!uid) return null

    for await (const message of client.fetch([uid], { source: true }, { uid: true })) {
      if (message.source) return message.source
    }
    return null
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {}
  }
}

/** Télécharge le corps complet uniquement pour les UIDs demandés. */
export async function fetchMessageSources(
  config: MailAccountConfig,
  uids: number[],
  mailboxPath = 'INBOX',
): Promise<ImapMessageSource[]> {
  if (!uids.length) return []

  const client = createImapClient(config)
  await client.connect()
  const lock = await client.getMailboxLock(mailboxPath)

  try {
    const messages: ImapMessageSource[] = []
    for await (const message of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
      if (message.source) {
        messages.push({ uid: message.uid, source: message.source })
      }
    }
    return messages
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {}
  }
}

/** Legacy — télécharge tout le source (lent). */
export async function fetchRecentMessages(
  config: MailAccountConfig,
  options: { sinceDays?: number; limit?: number; minUid?: number; fullScan?: boolean } = {},
): Promise<Array<{ uid: number; source: Buffer }>> {
  const envelopes = await fetchRecentEnvelopes(config, options)
  if (!envelopes.length) return []
  const sources = await fetchMessageSources(config, envelopes.map(e => e.uid))
  return sources
}

export async function testImapConnection(config: MailAccountConfig): Promise<{ exists: number }> {
  const client = createImapClient(config)
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  try {
    return { exists: mailboxExists(client) }
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {}
  }
}
