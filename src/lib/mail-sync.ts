import { simpleParser } from 'mailparser'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchRecentEnvelopes,
  fetchMessageSources,
  formatImapError,
  resolveSpecialMailboxes,
  type MailAccountConfig,
  type ImapEnvelopeMeta,
  type ResolvedMailboxes,
} from '@/lib/imap-client'
import { parseMailAttachments, extractEmailAddress, type StoredEmailAttachment } from '@/lib/mail-attachments'
import { isEmailIncompleteForEnrich } from '@/lib/mail-enrich'
import { attachmentMetaOnly, persistAttachmentsToStorage } from '@/lib/mail-storage'
import { createAdminClient } from '@/lib/supabase'
import { detectAo } from '@/services/aoDetector.service'
import { isDuplicateKeyError, normalizeMessageId } from '@/lib/mail-message-id'
import type { AddressObject } from 'mailparser'

function addressObjectText(addr: AddressObject | AddressObject[] | undefined): string {
  if (!addr) return ''
  if (Array.isArray(addr)) {
    return addr.map(a => a.text ?? a.value?.[0]?.address ?? '').filter(Boolean).join(', ')
  }
  return addr.text ?? addr.value?.[0]?.address ?? ''
}

export interface MailSyncAccountReport {
  user_id: string
  email: string | null
  display_name: string | null
  status: 'ok' | 'skipped' | 'error'
  reason?: string
  stored?: number
  fetched?: number
}

export interface MailSyncResult {
  fetched: number
  stored: number
  updated: number
  aoDetected: number
  duplicates: number
  errors: number
  maxUid: number
  quickStored?: number
  skippedOutbound?: number
  mailboxes?: ResolvedMailboxes
  accounts?: MailSyncAccountReport[]
}

export type MailAccountWithId = MailAccountConfig & {
  id?: string
  last_sync_uid?: number | null
}

export interface MailSourceMeta {
  sourceMemberId?: string | null
  sourceMemberName?: string | null
}

function mergeSyncResults(target: MailSyncResult, part: MailSyncResult) {
  target.fetched += part.fetched
  target.stored += part.stored
  target.updated += part.updated
  target.aoDetected += part.aoDetected
  target.duplicates += part.duplicates
  target.errors += part.errors
  target.maxUid = Math.max(target.maxUid, part.maxUid)
  target.quickStored = (target.quickStored ?? 0) + (part.quickStored ?? 0)
  if (part.mailboxes) target.mailboxes = part.mailboxes
}

function mapMailAccountRow(account: {
  id: string
  imap_host?: string | null
  imap_port?: number | null
  imap_user?: string | null
  imap_pass?: string | null
  last_sync_uid?: number | null
}): MailAccountWithId | null {
  if (!account.imap_user || !account.imap_pass) return null
  return {
    id: account.id,
    imap_host: account.imap_host || 'mail.gandi.net',
    imap_port: Number(account.imap_port) || 993,
    imap_user: account.imap_user,
    imap_pass: account.imap_pass,
    last_sync_uid: account.last_sync_uid ?? 0,
  }
}

export async function resolveMailAccounts(
  userId: string,
  options?: { loginEmail?: string | null },
): Promise<MailAccountWithId[]> {
  const db = createAdminClient()
  const { data: rows } = await db
    .from('mail_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)

  const accounts: MailAccountWithId[] = []
  for (const row of rows ?? []) {
    const mapped = mapMailAccountRow(row)
    if (mapped) accounts.push(mapped)
  }

  const loginEmail = options?.loginEmail?.toLowerCase().trim()
  if (loginEmail) {
    const own = accounts.filter(a => a.imap_user?.toLowerCase().trim() === loginEmail)
    if (own.length) return own
  }

  return accounts
}

export async function resolveMailAccount(
  userId: string,
  options?: { loginEmail?: string | null },
): Promise<MailAccountWithId | null> {
  const accounts = await resolveMailAccounts(userId, options)
  return accounts[0] ?? null
}

async function fetchEnvelopesWithFallback(
  account: MailAccountWithId,
  mailboxPath: string,
  opts: { sinceDays: number; limit: number; minUid?: number; fullScan?: boolean },
) {
  return fetchRecentEnvelopes(account, { ...opts, mailboxPath })
}

async function saveEmailAttachments(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  rawAttachments: StoredEmailAttachment[],
) {
  if (!rawAttachments.length) return []
  const stored = await persistAttachmentsToStorage(db, userId, emailId, rawAttachments)
  const meta = stored.map(attachmentMetaOnly)
  await db.from('emails').update({
    attachments: meta,
    has_attachments: meta.length > 0,
  }).eq('id', emailId)
  return meta
}

function isOwnOutbound(fromAddress: string, toAddress: string, accountEmail: string): boolean {
  const from = extractEmailAddress(fromAddress)
  const own = extractEmailAddress(accountEmail) || accountEmail.toLowerCase().trim()
  if (!from || from !== own) return false
  const toLower = toAddress.toLowerCase()
  if (own && toLower.includes(own)) return false
  return true
}

function isLikelyInbound(fromAddress: string, accountEmail: string): boolean {
  const from = extractEmailAddress(fromAddress)
  const own = extractEmailAddress(accountEmail) || accountEmail.toLowerCase().trim()
  return !!from && from !== own
}

/** Corrige les mails reçus classés en Envoyés (ou envoyés bloqués en Inbox). */
async function reconcileMailFolders(
  db: SupabaseClient,
  userId: string,
  accountEmail: string,
): Promise<number> {
  const own = extractEmailAddress(accountEmail) || accountEmail.toLowerCase().trim()
  if (!own) return 0

  let fixed = 0
  const { data: misSent } = await db
    .from('emails')
    .select('id, from_address')
    .eq('user_id', userId)
    .eq('mail_folder', 'sent')

  for (const row of misSent ?? []) {
    if (isLikelyInbound(row.from_address ?? '', accountEmail)) {
      await db.from('emails').update({ mail_folder: 'inbox' }).eq('id', row.id)
      fixed++
    }
  }

  const { data: misInbox } = await db
    .from('emails')
    .select('id, from_address')
    .eq('user_id', userId)
    .or('mail_folder.eq.inbox,mail_folder.is.null')

  for (const row of misInbox ?? []) {
    if (isOwnOutbound(row.from_address ?? '', '', accountEmail)) {
      await db.from('emails').update({ mail_folder: 'sent' }).eq('id', row.id)
      fixed++
    }
  }

  return fixed
}

type DbMailFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam'

function envelopeMessageId(
  userId: string,
  envelope: ImapEnvelopeMeta,
  mailboxPath: string,
): string {
  return normalizeMessageId(envelope.messageId, `uid-${userId}-${mailboxPath}-${envelope.uid}`)
}

async function loadExistingMessageIds(
  db: SupabaseClient,
  userId: string,
  messageIds: string[],
): Promise<Set<string>> {
  const found = new Set<string>()
  if (!messageIds.length) return found
  const normalizedChunk = [...new Set(messageIds.map(id => normalizeMessageId(id)))]
  for (let i = 0; i < normalizedChunk.length; i += 150) {
    const chunk = normalizedChunk.slice(i, i + 150)
    const { data } = await db
      .from('emails')
      .select('message_id')
      .eq('user_id', userId)
      .in('message_id', chunk)
    for (const row of data ?? []) {
      if (row.message_id) found.add(normalizeMessageId(row.message_id))
    }
  }
  return found
}

async function quickInsertFromEnvelope(
  db: SupabaseClient,
  userId: string,
  envelope: ImapEnvelopeMeta,
  mailFolder: DbMailFolder,
  mailboxPath: string,
  source?: MailSourceMeta,
): Promise<string | null> {
  const detection = detectAo(envelope.subject, '')
  const messageId = envelopeMessageId(userId, envelope, mailboxPath)
  const insertPayload: Record<string, unknown> = {
    user_id: userId,
    message_id: messageId,
    subject: envelope.subject,
    from_address: envelope.from,
    to_address: envelope.to,
    body_text: '',
    body_html: '',
    received_at: envelope.date.toISOString(),
    is_read: envelope.isRead,
    is_ao: detection.isAo,
    ao_score: detection.score,
    tender_id: null,
    attachments: [],
    has_attachments: false,
    mail_folder: mailFolder,
    imap_uid: envelope.uid,
    imap_mailbox: mailboxPath,
  }
  if (source?.sourceMemberId) {
    insertPayload.source_member_id = source.sourceMemberId
    insertPayload.source_member_name = source.sourceMemberName ?? null
  }

  let { data: inserted, error } = await db.from('emails').insert(insertPayload).select('id').single()

  if (error) {
    const fallback: Record<string, unknown> = { ...insertPayload }
    delete fallback.attachments
    delete fallback.has_attachments
    delete fallback.source_member_id
    delete fallback.source_member_name
    delete fallback.priority
    delete fallback.labels
    delete fallback.mail_folder
    delete fallback.imap_uid
    delete fallback.imap_mailbox
    const retry = await db.from('emails').insert(fallback).select('id').single()
    inserted = retry.data
    error = retry.error
  }

  if (error) {
    if (isDuplicateKeyError(error.message)) return null
    console.error('[Mail sync] quick insert:', error.message, envelope.subject)
    return null
  }
  return inserted?.id ?? null
}

async function enrichEmailFromSource(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  source: Buffer,
  envelope: ImapEnvelopeMeta,
  account: MailAccountWithId,
  result: MailSyncResult,
) {
  const parsed = await simpleParser(source)
  const detection = detectAo(parsed.subject ?? envelope.subject, parsed.text ?? '')
  const { attachments, hasAttachments } = parseMailAttachments(parsed.attachments)

  const updates: Record<string, unknown> = {
    subject: parsed.subject ?? envelope.subject,
    from_address: addressObjectText(parsed.from) || envelope.from,
    to_address: addressObjectText(parsed.to) || envelope.to,
    body_text: parsed.text ?? '',
    body_html: parsed.html || '',
    received_at: (parsed.date ?? envelope.date).toISOString(),
    is_ao: detection.isAo,
    ao_score: detection.score,
    is_read: envelope.isRead,
  }

  await db.from('emails').update(updates).eq('id', emailId)

  if (detection.isAo) result.aoDetected++

  let savedAttachments = attachments
  if (hasAttachments) {
    savedAttachments = await saveEmailAttachments(db, userId, emailId, attachments)
  }

}

async function syncOneMailboxFolder(
  db: SupabaseClient,
  userId: string,
  account: MailAccountWithId,
  result: MailSyncResult,
  job: {
    folder: DbMailFolder
    mailboxPath: string
    sinceDays: number
    limit: number
    skipOutbound: boolean
    fullScan: boolean
  },
  quick: boolean,
  source?: MailSourceMeta,
) {
  const fetchOpts = {
    sinceDays: job.sinceDays,
    limit: job.limit,
    minUid: 0,
    fullScan: job.fullScan,
  }

  const envelopes = await fetchEnvelopesWithFallback(account, job.mailboxPath, fetchOpts)
  result.fetched += envelopes.length
  if (envelopes.length && job.folder === 'inbox') {
    result.maxUid = Math.max(result.maxUid, ...envelopes.map(m => m.uid))
  }

  let candidates = job.skipOutbound
    ? envelopes.filter(e => !isOwnOutbound(e.from, e.to, account.imap_user))
    : envelopes
  if (job.folder === 'sent') {
    candidates = candidates.filter(e => isOwnOutbound(e.from, e.to, account.imap_user))
  }
  if (job.skipOutbound) {
    result.skippedOutbound = (result.skippedOutbound ?? 0) + (envelopes.length - candidates.length)
  }

  const existingIds = await loadExistingMessageIds(
    db,
    userId,
    candidates.map(e => envelopeMessageId(userId, e, job.mailboxPath)),
  )

  const newEnvelopes: ImapEnvelopeMeta[] = []
  const existingEnvelopes: ImapEnvelopeMeta[] = []

  for (const envelope of candidates) {
    const mid = envelopeMessageId(userId, envelope, job.mailboxPath)
    if (existingIds.has(mid)) existingEnvelopes.push(envelope)
    else newEnvelopes.push(envelope)
  }

  result.duplicates += candidates.length - newEnvelopes.length

  const newEmailMap = new Map<number, string>()
  for (const envelope of newEnvelopes) {
    try {
      const emailId = await quickInsertFromEnvelope(
        db, userId, envelope, job.folder, job.mailboxPath, source,
      )
      if (emailId) {
        newEmailMap.set(envelope.uid, emailId)
        result.stored++
        result.quickStored = (result.quickStored ?? 0) + 1
        if (job.folder === 'inbox' && detectAo(envelope.subject, '').isAo) result.aoDetected++
      } else {
        result.errors++
      }
    } catch (err) {
      result.errors++
      console.error(`[Mail sync/${job.folder}] quick insert:`, err)
    }
  }

  for (const envelope of existingEnvelopes) {
    if (job.folder === 'sent' && !isOwnOutbound(envelope.from, envelope.to, account.imap_user)) {
      continue
    }
    if (job.folder === 'inbox' && isOwnOutbound(envelope.from, envelope.to, account.imap_user)) {
      continue
    }
    const patch: Record<string, unknown> = {
      is_read: envelope.isRead,
      mail_folder: job.folder,
      imap_uid: envelope.uid,
      imap_mailbox: job.mailboxPath,
    }
    if (job.folder === 'inbox') {
      const d = detectAo(envelope.subject, '')
      if (d.isAo || d.score > 0) {
        patch.is_ao = d.isAo
        patch.ao_score = d.score
        if (d.isAo) result.aoDetected++
      }
    }
    const mid = envelopeMessageId(userId, envelope, job.mailboxPath)
    await db.from('emails')
      .update(patch)
      .eq('user_id', userId)
      .eq('message_id', mid)
    result.updated++
  }

  const enrichLimit = quick ? (job.folder === 'inbox' ? 15 : 8) : (job.folder === 'inbox' ? 40 : 20)
  const enrichUids = newEnvelopes.map(e => e.uid).slice(-enrichLimit)

  if (enrichUids.length) {
    try {
      const sources = await fetchMessageSources(account, enrichUids, job.mailboxPath)
      const envelopeByUid = new Map(newEnvelopes.map(e => [e.uid, e]))

      for (const { uid, source: raw } of sources) {
        const envelope = envelopeByUid.get(uid)
        const emailId = newEmailMap.get(uid)
        if (!envelope || !emailId) continue
        try {
          await enrichEmailFromSource(db, userId, emailId, raw, envelope, account, result)
        } catch (err) {
          result.errors++
          console.error(`[Mail sync/${job.folder}] enrich:`, err)
        }
      }
    } catch (err) {
      console.error(`[Mail sync/${job.folder}] source fetch:`, err)
    }
  }

  if (job.folder === 'inbox' && existingEnvelopes.length) {
    const { data: recentDbEmails } = await db
      .from('emails')
      .select('id, message_id, body_text, body_html, has_attachments, attachments, imap_mailbox')
      .eq('user_id', userId)
      .eq('mail_folder', 'inbox')
      .order('received_at', { ascending: false })
      .limit(80)

    const incompleteByMsgId = new Map<string, { id: string; imap_mailbox?: string | null }>()
    for (const em of recentDbEmails ?? []) {
      if (em.message_id && isEmailIncompleteForEnrich(em)) {
        incompleteByMsgId.set(em.message_id, { id: em.id, imap_mailbox: em.imap_mailbox })
      }
    }

    const existingEnrichList: {
      uid: number
      envelope: ImapEnvelopeMeta
      emailId: string
      mailboxPath: string
    }[] = []
    for (const envelope of existingEnvelopes) {
      const mid = envelopeMessageId(userId, envelope, job.mailboxPath)
      const row = incompleteByMsgId.get(mid)
      if (row) {
        existingEnrichList.push({
          uid: envelope.uid,
          envelope,
          emailId: row.id,
          mailboxPath: row.imap_mailbox ?? job.mailboxPath,
        })
      }
    }

    const toEnrichExisting = existingEnrichList.slice(0, quick ? 10 : 25)
    if (toEnrichExisting.length) {
      const byMailbox = new Map<string, typeof toEnrichExisting>()
      for (const item of toEnrichExisting) {
        const list = byMailbox.get(item.mailboxPath) ?? []
        list.push(item)
        byMailbox.set(item.mailboxPath, list)
      }
      for (const [mbPath, items] of byMailbox) {
        try {
          const sources = await fetchMessageSources(account, items.map(e => e.uid), mbPath)
          const byUid = new Map(items.map(e => [e.uid, e]))
          for (const { uid, source: raw } of sources) {
            const item = byUid.get(uid)
            if (!item) continue
            try {
              await enrichEmailFromSource(db, userId, item.emailId, raw, item.envelope, account, result)
              result.updated++
            } catch (err) {
              result.errors++
            }
          }
        } catch (err) {
          console.error('[Mail sync] existing source fetch:', err)
        }
      }
    }
  }
}

export async function syncMailAccount(
  userId: string,
  account: MailAccountWithId,
  options: { backfill?: boolean; quick?: boolean } = {},
  source?: MailSourceMeta,
): Promise<MailSyncResult> {
  const backfill = options.backfill === true
  const quick = options.quick === true || !backfill
  const fullScan = backfill && !quick

  const db = createAdminClient()
  const result: MailSyncResult = {
    fetched: 0,
    stored: 0,
    updated: 0,
    aoDetected: 0,
    duplicates: 0,
    errors: 0,
    maxUid: account.last_sync_uid ?? 0,
    quickStored: 0,
    skippedOutbound: 0,
  }

  const reconciled = await reconcileMailFolders(db, userId, account.imap_user)
  if (reconciled > 0) result.updated += reconciled

  const mailboxes = await resolveSpecialMailboxes(account)
  result.mailboxes = mailboxes
  if (!mailboxes.sent) {
    console.warn(`[Mail sync] dossier Envoyés introuvable pour ${account.imap_user}`)
  }
  const inboxSince = fullScan ? 180 : quick ? 35 : 45
  const inboxLimit = fullScan ? 300 : quick ? 200 : 150

  const jobs: Array<{
    folder: DbMailFolder
    mailboxPath?: string
    sinceDays: number
    limit: number
    skipOutbound: boolean
  }> = [
    { folder: 'inbox', mailboxPath: mailboxes.inbox, sinceDays: inboxSince, limit: inboxLimit, skipOutbound: true },
    { folder: 'sent', mailboxPath: mailboxes.sent, sinceDays: fullScan ? 365 : 180, limit: fullScan ? 250 : 150, skipOutbound: false },
    { folder: 'drafts', mailboxPath: mailboxes.drafts, sinceDays: 90, limit: 40, skipOutbound: false },
    { folder: 'trash', mailboxPath: mailboxes.trash, sinceDays: 60, limit: 60, skipOutbound: false },
    { folder: 'spam', mailboxPath: mailboxes.spam, sinceDays: 60, limit: 60, skipOutbound: false },
  ]

  for (const job of jobs) {
    if (!job.mailboxPath) continue
    try {
      await syncOneMailboxFolder(
        db,
        userId,
        account,
        result,
        { ...job, mailboxPath: job.mailboxPath, fullScan },
        quick,
        source,
      )
    } catch (err) {
      result.errors++
      console.error(`[Mail sync] dossier ${job.folder}:`, err)
    }
  }

  if (backfill && !quick) {
    const { data: recentEmails } = await db
      .from('emails')
      .select('id, subject, body_text, is_ao, ao_score')
      .eq('user_id', userId)
      .order('received_at', { ascending: false })
      .limit(150)

    for (const em of recentEmails ?? []) {
      const d = detectAo(em.subject ?? '', em.body_text ?? '')
      if (d.isAo !== em.is_ao || d.score !== em.ao_score) {
        await db.from('emails').update({ is_ao: d.isAo, ao_score: d.score }).eq('id', em.id)
        if (d.isAo && !em.is_ao) result.aoDetected++
        result.updated++
      }
    }
  }

  if (account.id) {
    await db
      .from('mail_accounts')
      .update({
        last_sync: new Date().toISOString(),
        last_sync_uid: result.maxUid,
      })
      .eq('id', account.id)
  }

  return result
}

async function syncOneAccount(
  userId: string,
  email: string | null,
  displayName: string | null,
  options: { backfill?: boolean; quick?: boolean },
  source?: MailSourceMeta,
): Promise<{ report: MailSyncAccountReport; result: MailSyncResult | null }> {
  const account = await resolveMailAccount(userId, { loginEmail: email })
  if (!account) {
    return {
      report: {
        user_id: userId,
        email,
        display_name: displayName,
        status: 'skipped',
        reason: 'compte_mail_non_configure',
      },
      result: null,
    }
  }

  try {
    const result = await syncMailAccount(userId, account, options, source)
    return {
      report: {
        user_id: userId,
        email: email ?? account.imap_user,
        display_name: displayName,
        status: 'ok',
        stored: result.stored,
        fetched: result.fetched,
      },
      result,
    }
  } catch (e) {
    return {
      report: {
        user_id: userId,
        email: email ?? account.imap_user,
        display_name: displayName,
        status: 'error',
        reason: formatImapError(e),
      },
      result: null,
    }
  }
}

/** Sync tous les comptes IMAP du user connecté (messagerie personnelle). */
export async function syncUserMailAccounts(
  userId: string,
  options: { backfill?: boolean; quick?: boolean; loginEmail?: string | null } = {},
): Promise<MailSyncResult> {
  const accounts = await resolveMailAccounts(userId, { loginEmail: options.loginEmail })
  const aggregated: MailSyncResult = {
    fetched: 0,
    stored: 0,
    updated: 0,
    aoDetected: 0,
    duplicates: 0,
    errors: 0,
    maxUid: 0,
    quickStored: 0,
    accounts: [],
  }

  if (!accounts.length) {
    aggregated.accounts!.push({
      user_id: userId,
      email: null,
      display_name: null,
      status: 'skipped',
      reason: 'compte_mail_non_configure',
    })
    return aggregated
  }

  for (const account of accounts) {
    try {
      const result = await syncMailAccount(userId, account, options)
      mergeSyncResults(aggregated, result)
      aggregated.accounts!.push({
        user_id: userId,
        email: account.imap_user,
        display_name: null,
        status: 'ok',
        stored: result.stored,
        fetched: result.fetched,
      })
    } catch (e) {
      aggregated.errors++
      aggregated.accounts!.push({
        user_id: userId,
        email: account.imap_user,
        display_name: null,
        status: 'error',
        reason: formatImapError(e),
      })
    }
  }

  return aggregated
}

/** Famille — désactivé côté API pour les tests ; conservé pour réactivation ultérieure. */
export async function syncFamilyMailAccounts(
  ownerId: string,
  options: { backfill?: boolean; quick?: boolean; loginEmail?: string | null } = {},
): Promise<MailSyncResult> {
  const { getFamilyContext, memberDisplayName } = await import('@/lib/family')
  const ctx = await getFamilyContext(ownerId)
  const aggregated: MailSyncResult = {
    fetched: 0,
    stored: 0,
    updated: 0,
    aoDetected: 0,
    duplicates: 0,
    errors: 0,
    maxUid: 0,
    quickStored: 0,
    accounts: [],
  }

  const ownerMember = ctx.members.find(m => m.user_id === ownerId)
  const ownerSync = await syncOneAccount(
    ownerId,
    ownerMember?.email ?? null,
    ownerMember?.display_name ?? null,
    options,
  )
  aggregated.accounts!.push(ownerSync.report)
  if (ownerSync.result) mergeSyncResults(aggregated, ownerSync.result)
  else if (ownerSync.report.status === 'error') aggregated.errors++

  if (!ctx.isOwner) return aggregated

  for (const member of ctx.members) {
    if (member.user_id === ownerId) continue
    const memberSync = await syncOneAccount(
      member.user_id,
      member.email,
      member.display_name,
      options,
      {
        sourceMemberId: member.user_id,
        sourceMemberName: memberDisplayName(member),
      },
    )
    aggregated.accounts!.push(memberSync.report)
    if (memberSync.result) mergeSyncResults(aggregated, memberSync.result)
    else if (memberSync.report.status === 'error') aggregated.errors++
  }

  return aggregated
}

export { formatImapError }
