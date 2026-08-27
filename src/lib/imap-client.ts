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
  cc: string
  bcc: string
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
    return 'Identifiants IMAP incorrects — vérifiez email et mot de passe dans Paramètres > Messagerie'
  }
  const parts = [err.message ?? 'Erreur inconnue']
  if (err.responseStatus) parts.push(`[${err.responseStatus}]`)
  if (err.responseText) parts.push(err.responseText)
  if (err.executedCommand) parts.push(`(commande: ${err.executedCommand})`)
  return parts.join(' ')
}

export function createImapClient(config: MailAccountConfig, timeoutMs = 8000): ImapFlow {
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
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
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

function mailboxUidValidity(client: ImapFlow): number {
  const mb = client.mailbox
  if (!mb || typeof mb === 'boolean') return 0
  return Number(mb.uidValidity ?? 0)
}

/** UIDVALIDITY a changé → les UID ne sont plus comparables, resync du dossier. */
export function imapUidValidityChanged(stored: number, current: number): boolean {
  return stored > 0 && current > 0 && stored !== current
}

function envelopeToMeta(
  uid: number,
  envelope: {
    messageId?: string
    subject?: string
    from?: { address?: string; name?: string }[]
    to?: { address?: string; name?: string }[]
    cc?: { address?: string; name?: string }[]
    bcc?: { address?: string; name?: string }[]
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
    cc: formatAddressList(envelope?.cc),
    bcc: formatAddressList(envelope?.bcc),
    date: envelope?.date ?? internal ?? new Date(),
    isRead: flags?.has('\\Seen') ?? false,
  }
}

/** Plage UID IMAP pour sync incrémentale (UID strictement > last_sync_uid). */
export function incrementalUidSearchRange(lastSyncUid: number): string {
  return `${lastSyncUid + 1}:*`
}

/** Filtre les UID > last_sync_uid (équivalent logique du search IMAP incremental). */
export function filterUidsAboveLastSync(lastSyncUid: number, uids: number[]): number[] {
  if (lastSyncUid <= 0) return [...uids].sort((a, b) => a - b)
  return uids.filter(u => u > lastSyncUid).sort((a, b) => a - b)
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
  preferHighest = true,
): Promise<ImapEnvelopeMeta[]> {
  if (!uids.length) return []
  const sorted = [...uids].sort((a, b) => a - b)
  const targetUids = limit > 0 && sorted.length > limit
    ? (preferHighest ? sorted.slice(-limit) : sorted.slice(0, limit))
    : sorted
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
    .sort((a, b) => b.uid - a.uid)
    .slice(0, limit)
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
  return messages.sort((a, b) => b.uid - a.uid).slice(0, limit)
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

type SentMailboxScore = {
  path: string
  total: number
  outbound: number
  score: number
}

/** Score un dossier Envoyés — ne favorise pas les dossiers vides (faux positifs Gandi/Outlook). */
async function scoreSentMailboxOnClient(
  client: ImapFlow,
  mailboxPath: string,
  accountUser: string,
): Promise<SentMailboxScore | null> {
  try {
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      const envelopes = await fetchEnvelopeBySequence(client, 50, accountUser, sinceDate(365))
      if (!envelopes.length) return { path: mailboxPath, total: 0, outbound: 0, score: 0 }
      const aliases = accountEmailAliases(accountUser)
      const outbound = envelopes.filter(e => isFromAccountAddress(e.from, aliases)).length
      const ratio = outbound / envelopes.length
      const score = outbound * 100 + ratio * 50 + envelopes.length
      return { path: mailboxPath, total: envelopes.length, outbound, score }
    } finally {
      lock.release()
    }
  } catch {
    return null
  }
}

async function validateSentMailboxOnClient(
  client: ImapFlow,
  mailboxPath: string,
  accountUser: string,
): Promise<boolean> {
  const scored = await scoreSentMailboxOnClient(client, mailboxPath, accountUser)
  if (!scored) return false
  if (scored.total === 0) return false
  return scored.outbound >= Math.ceil(scored.total / 2)
}

/** Chemin sous Courrier indésirable / Junk (faux \\Sent sur Gandi/Thunderbird). */
function pathLooksLikeSpamTree(path: string): boolean {
  const lower = path.toLowerCase()
  const parts = lower.split(/[/\\]/)
  return parts.some(p =>
    ['junk', 'spam', 'courrier indésirable', 'courrier indesirable', 'indésirables', 'indesirables'].includes(p),
  )
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
    const accountUser = config.imap_user.trim()

    const sentCandidates = new Set<string>()
    for (const m of mailboxes) {
      if (m.specialUse === '\\Sent' && !pathLooksLikeSpamTree(m.path)) {
        sentCandidates.add(m.path)
      }
      if (m.specialUse === '\\Drafts' && !result.drafts) result.drafts = m.path
      if (m.specialUse === '\\Trash' && !pathLooksLikeSpamTree(m.path) && !result.trash) {
        result.trash = m.path
      }
      if (m.specialUse === '\\Junk' && !result.spam) result.spam = m.path
    }
    for (const m of mailboxes) {
      if (MAILBOX_NAME_HINTS.sent.some(h => pathMatchesHint(m.path, h)) && !pathLooksLikeSpamTree(m.path)) {
        sentCandidates.add(m.path)
      }
    }
    for (const path of ['Sent', 'INBOX.Sent', 'INBOX/Sent']) {
      if (mailboxes.some(m => m.path === path)) sentCandidates.add(path)
    }
    let bestSent: SentMailboxScore | null = null
    for (const path of sentCandidates) {
      const scored = await scoreSentMailboxOnClient(client, path, accountUser)
      if (!scored) continue
      if (!bestSent || scored.score > bestSent.score) bestSent = scored
    }
    if (bestSent && bestSent.outbound > 0) {
      result.sent = bestSent.path
      sentFromSpecialUse = mailboxes.some(m => m.path === bestSent!.path && m.specialUse === '\\Sent')
    }
    for (const [kind, hints] of Object.entries(MAILBOX_NAME_HINTS) as Array<
      [Exclude<keyof ResolvedMailboxes, 'inbox' | 'custom'>, string[]]
    >) {
      if (result[kind]) continue
      for (const m of mailboxes) {
        if (kind === 'sent' && pathLooksLikeSpamTree(m.path)) continue
        if (kind === 'trash' && pathLooksLikeSpamTree(m.path)) continue
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
      const valid = await validateSentMailboxOnClient(client, result.sent, accountUser)
      if (!valid) {
        const rejected = result.sent
        console.warn(`[IMAP] dossier "${rejected}" ignoré — contient du courrier reçu, pas des envoyés`)
        delete result.sent
        for (const path of sentCandidates) {
          if (path === rejected) continue
          if (await validateSentMailboxOnClient(client, path, accountUser)) {
            result.sent = path
            break
          }
        }
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
    if (minUid > 0) {
      try {
        const newUids = await client.search({ uid: incrementalUidSearchRange(minUid) }, { uid: true })
        if (Array.isArray(newUids) && newUids.length) {
          batches.push(await fetchEnvelopeByUidRange(client, newUids, uidFetchLimit, accountUser))
        }
      } catch {
        /* search UID range non supporté */
      }
    }

    batches.push(await fetchEnvelopeBySequence(client, limit, accountUser, since))
    batches.push(await fetchEnvelopeBySinceStream(client, since, limit, accountUser))

    try {
      const uids = await client.search({ since }, { uid: true })
      if (Array.isArray(uids) && uids.length) {
        batches.push(await fetchEnvelopeByUidRange(client, uids, uidFetchLimit, accountUser))
      }
    } catch {
      /* fallback */
    }

    const merged = mergeEnvelopesByUid(batches)
    return merged.sort((a, b) => b.uid - a.uid).slice(0, limit)
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

    if (minUid > 0) {
      try {
        const newUids = await client.search({ uid: incrementalUidSearchRange(minUid) }, { uid: true })
        if (Array.isArray(newUids) && newUids.length) {
          batches.push(await fetchEnvelopeByUidRange(client, newUids, uidFetchLimit, accountUser))
        }
      } catch {
        /* search UID range non supporté */
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
  const sorted = merged.sort((a, b) => b.uid - a.uid)
  const resultCap = fullScan ? Math.max(limit, sorted.length) : mergeCap
  return sorted.slice(0, resultCap)
}

export type MailboxBackfillBatch = {
  envelopes: ImapEnvelopeMeta[]
  mailboxTotal: number
  maxUid: number
  batchMinUid: number
  hasMore: boolean
  uidValidity: number
}

/** @deprecated Alias — utiliser MailboxBackfillBatch */
export type InboxBackfillBatch = MailboxBackfillBatch

/** Lot de sync initiale (INBOX ou Envoyés) : UID les plus récents en premier, puis descente. */
export async function fetchMailboxBackfillBatch(
  config: MailAccountConfig,
  mailboxPath: string,
  options: { belowUid: number; limit: number },
): Promise<MailboxBackfillBatch> {
  const accountUser = config.imap_user.trim()
  const client = createImapClient(config)
  await client.connect()
  const lock = await client.getMailboxLock(mailboxPath)

  try {
    const exists = mailboxExists(client)
    const allUidsRaw = await client.search({ all: true }, { uid: true })
    const allUids = Array.isArray(allUidsRaw) ? allUidsRaw : []
    const mailboxTotal = allUids.length || exists
    const maxUid = allUids.length ? Math.max(...allUids) : 0

    let candidates = allUids
    if (options.belowUid > 0) {
      candidates = allUids.filter(u => u < options.belowUid)
    }

    const batchUids = [...candidates].sort((a, b) => b - a).slice(0, options.limit)
    const envelopes = batchUids.length
      ? await fetchEnvelopeByUidRange(client, batchUids, 0, accountUser, true)
      : []

    const batchMinUid = batchUids.length ? Math.min(...batchUids) : 0
    const minUidInMailbox = allUids.length ? Math.min(...allUids) : 0
    const hasMore = batchUids.length > 0 && batchMinUid > minUidInMailbox
    const uidValidity = mailboxUidValidity(client)

    return {
      envelopes: envelopes.sort((a, b) => b.uid - a.uid),
      mailboxTotal,
      maxUid,
      batchMinUid,
      hasMore,
      uidValidity,
    }
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch { /* ignore */ }
  }
}

/** Lot de sync initiale INBOX — alias de fetchMailboxBackfillBatch. */
export async function fetchInboxBackfillBatch(
  config: MailAccountConfig,
  mailboxPath: string,
  options: { belowUid: number; limit: number },
): Promise<MailboxBackfillBatch> {
  return fetchMailboxBackfillBatch(config, mailboxPath, options)
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

  const searchInMailbox = async (path: string): Promise<number | undefined> => {
    const lock = await client.getMailboxLock(path)
    try {
      for (const mid of candidates) {
        const uids = await client.search({ header: { 'message-id': mid } }, { uid: true })
        if (Array.isArray(uids) && uids.length) return uids[uids.length - 1]
      }
      return undefined
    } finally {
      lock.release()
    }
  }

  try {
    let foundMailbox = mailboxPath
    let uid = await searchInMailbox(mailboxPath)

    // Le message a pu être déplacé/classé dans un autre dossier depuis le dernier sync —
    // sans ce filet, la ré-enrichissement (corps + PJ) abandonnait silencieusement et
    // l'email restait marqué sans pièce jointe pour toujours, même si elle existe côté serveur.
    if (!uid) {
      const mailboxes = await client.list()
      for (const mbox of mailboxes) {
        if (mbox.path === mailboxPath) continue
        uid = await searchInMailbox(mbox.path)
        if (uid) { foundMailbox = mbox.path; break }
      }
    }

    if (!uid) return null

    const lock = await client.getMailboxLock(foundMailbox)
    try {
      for await (const message of client.fetch([uid], { source: true }, { uid: true })) {
        if (message.source) return message.source
      }
      return null
    } finally {
      lock.release()
    }
  } finally {
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
