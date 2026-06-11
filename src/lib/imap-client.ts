import { ImapFlow } from 'imapflow'

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

/** Liste rapide des enveloppes (sans télécharger le corps — ~10x plus rapide). */
export async function fetchRecentEnvelopes(
  config: MailAccountConfig,
  options: { sinceDays?: number; limit?: number; minUid?: number; fullScan?: boolean } = {},
): Promise<ImapEnvelopeMeta[]> {
  const sinceDays = options.sinceDays ?? 30
  const limit = options.limit ?? 40
  const minUid = options.minUid ?? 0
  const fullScan = options.fullScan === true
  const since = sinceDate(sinceDays)
  const accountUser = config.imap_user.trim()
  const client = createImapClient(config)

  await client.connect()
  const lock = await client.getMailboxLock('INBOX')

  try {
    const batches: ImapEnvelopeMeta[][] = []
    const mergeCap = Math.max(limit, 100)
    const uidFetchLimit = fullScan ? 0 : mergeCap

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
): Promise<Buffer | null> {
  const bare = messageId.replace(/^<|>$/g, '')
  const candidates = [messageId, `<${bare}>`, bare]

  const client = createImapClient(config)
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')

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
): Promise<ImapMessageSource[]> {
  if (!uids.length) return []

  const client = createImapClient(config)
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')

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
