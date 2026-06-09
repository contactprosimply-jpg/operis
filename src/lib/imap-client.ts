import { ImapFlow } from 'imapflow'

export interface MailAccountConfig {
  imap_host: string
  imap_port: number
  imap_user: string
  imap_pass: string
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
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 25000,
    tls: { minVersion: 'TLSv1.2' },
  })
}

function sinceDate(sinceDays: number): Date {
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)
  since.setHours(0, 0, 0, 0)
  return since
}

async function fetchByUidRange(
  client: ImapFlow,
  uids: number[],
  limit: number,
): Promise<Array<{ uid: number; source: Buffer }>> {
  if (!uids.length) return []
  const recentUids = uids.slice(-limit)
  const messages: Array<{ uid: number; source: Buffer }> = []
  for await (const message of client.fetch(recentUids, { uid: true, source: true }, { uid: true })) {
    if (message.source) {
      messages.push({ uid: message.uid, source: message.source })
    }
  }
  return messages
}

function mergeByUid(
  arrays: Array<Array<{ uid: number; source: Buffer }>>,
): Array<{ uid: number; source: Buffer }> {
  const map = new Map<number, { uid: number; source: Buffer }>()
  for (const arr of arrays) {
    for (const m of arr) map.set(m.uid, m)
  }
  return Array.from(map.values()).sort((a, b) => a.uid - b.uid)
}

async function fetchBySequence(
  client: ImapFlow,
  limit: number,
  since?: Date,
): Promise<Array<{ uid: number; source: Buffer }>> {
  const exists = client.mailbox?.exists ?? 0
  if (exists === 0) return []

  const window = Math.max(limit, 80)
  const startSeq = Math.max(1, exists - window + 1)
  const messages: Array<{ uid: number; source: Buffer; internalDate?: Date }> = []

  for await (const message of client.fetch(`${startSeq}:*`, {
    uid: true,
    source: true,
    internalDate: true,
  })) {
    if (!message.source) continue
    if (since && message.internalDate && message.internalDate < since) continue
    messages.push({
      uid: message.uid,
      source: message.source,
      internalDate: message.internalDate,
    })
  }

  return messages
    .sort((a, b) => a.uid - b.uid)
    .slice(-limit)
    .map(({ uid, source }) => ({ uid, source }))
}

async function fetchBySinceStream(
  client: ImapFlow,
  since: Date,
  limit: number,
): Promise<Array<{ uid: number; source: Buffer }>> {
  const messages: Array<{ uid: number; source: Buffer }> = []
  for await (const message of client.fetch({ since }, { uid: true, source: true })) {
    if (message.source) {
      messages.push({ uid: message.uid, source: message.source })
    }
    if (messages.length >= limit * 3) break
  }
  return messages.sort((a, b) => a.uid - b.uid).slice(-limit)
}

export async function fetchRecentMessages(
  config: MailAccountConfig,
  options: { sinceDays?: number; limit?: number; minUid?: number; fullScan?: boolean } = {},
): Promise<Array<{ uid: number; source: Buffer }>> {
  const sinceDays = options.sinceDays ?? 30
  const limit = options.limit ?? 40
  const minUid = options.minUid ?? 0
  const fullScan = options.fullScan === true
  const since = sinceDate(sinceDays)
  const client = createImapClient(config)

  await client.connect()
  const lock = await client.getMailboxLock('INBOX')

  try {
    const batches: Array<Array<{ uid: number; source: Buffer }>> = []

    // 1. Nouveaux UIDs depuis la dernière sync
    if (minUid > 0) {
      const newUids = await client.search({ uid: `${minUid + 1}:*` }, { uid: true })
      if (Array.isArray(newUids) && newUids.length) {
        batches.push(await fetchByUidRange(client, newUids, limit))
      }
    }

    // 2. Derniers messages par séquence (fiable Gandi — rattrape les mails manqués)
    batches.push(await fetchBySequence(client, limit, since))

    if (!fullScan && batches.some(b => b.length > 0)) {
      const merged = mergeByUid(batches)
      if (merged.length) return merged.slice(-limit)
    }

    // 3. SEARCH SINCE + UID fetch
    const uids = await client.search({ since }, { uid: true })
    if (Array.isArray(uids) && uids.length) {
      batches.push(await fetchByUidRange(client, uids, fullScan ? limit : Math.min(uids.length, limit * 2)))
    }

    // 4. Stream fetch par date
    batches.push(await fetchBySinceStream(client, since, fullScan ? limit : limit))

    const merged = mergeByUid(batches)
    return merged.slice(-limit)
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {}
  }
}

export async function testImapConnection(config: MailAccountConfig): Promise<{ exists: number }> {
  const client = createImapClient(config)
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  try {
    return { exists: client.mailbox?.exists ?? 0 }
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {}
  }
}
