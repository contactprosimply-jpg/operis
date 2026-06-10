import { simpleParser } from 'mailparser'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchRecentEnvelopes,
  fetchMessageSources,
  formatImapError,
  type MailAccountConfig,
  type ImapEnvelopeMeta,
} from '@/lib/imap-client'
import { parseMailAttachments, extractEmailAddress, type StoredEmailAttachment } from '@/lib/mail-attachments'
import { isEmailIncompleteForEnrich } from '@/lib/mail-enrich'
import { attachmentMetaOnly, persistAttachmentsToStorage } from '@/lib/mail-storage'
import { createAdminClient } from '@/lib/supabase'
import { detectAo } from '@/services/aoDetector.service'

export interface MailSyncResult {
  fetched: number
  stored: number
  updated: number
  aoDetected: number
  duplicates: number
  errors: number
  maxUid: number
  quickStored?: number
}

export type MailAccountWithId = MailAccountConfig & {
  id?: string
  last_sync_uid?: number | null
}

function getEnvMailAccount(): MailAccountConfig | null {
  if (!process.env.IMAP_USER || !process.env.IMAP_PASS) return null
  return {
    imap_host: process.env.IMAP_HOST || 'mail.gandi.net',
    imap_port: Number(process.env.IMAP_PORT) || 993,
    imap_user: process.env.IMAP_USER,
    imap_pass: process.env.IMAP_PASS,
  }
}

export async function resolveMailAccount(userId: string): Promise<MailAccountWithId | null> {
  const db = createAdminClient()

  const { data: account } = await db
    .from('mail_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (account?.imap_user && account?.imap_pass) {
    return {
      id: account.id,
      imap_host: account.imap_host || 'mail.gandi.net',
      imap_port: Number(account.imap_port) || 993,
      imap_user: account.imap_user,
      imap_pass: account.imap_pass,
      last_sync_uid: account.last_sync_uid ?? 0,
    }
  }

  const envAccount = getEnvMailAccount()
  if (envAccount) return envAccount

  return null
}

async function fetchEnvelopesWithFallback(
  account: MailAccountWithId,
  opts: { sinceDays: number; limit: number; minUid?: number; fullScan?: boolean },
) {
  try {
    return await fetchRecentEnvelopes(account, opts)
  } catch (primaryError) {
    const envAccount = getEnvMailAccount()
    if (!envAccount) throw primaryError
    const sameConfig =
      envAccount.imap_host === account.imap_host &&
      envAccount.imap_port === account.imap_port &&
      envAccount.imap_user === account.imap_user &&
      envAccount.imap_pass === account.imap_pass
    if (sameConfig) throw primaryError
    return fetchRecentEnvelopes(envAccount, opts)
  }
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

function isOwnOutbound(fromAddress: string, accountEmail: string): boolean {
  const from = extractEmailAddress(fromAddress)
  const own = extractEmailAddress(accountEmail) || accountEmail.toLowerCase().trim()
  return !!from && from === own
}

async function loadExistingMessageIds(
  db: SupabaseClient,
  userId: string,
  messageIds: string[],
): Promise<Set<string>> {
  const found = new Set<string>()
  if (!messageIds.length) return found
  for (let i = 0; i < messageIds.length; i += 150) {
    const chunk = messageIds.slice(i, i + 150)
    const { data } = await db
      .from('emails')
      .select('message_id')
      .eq('user_id', userId)
      .in('message_id', chunk)
    for (const row of data ?? []) found.add(row.message_id)
  }
  return found
}

async function quickInsertFromEnvelope(
  db: SupabaseClient,
  userId: string,
  envelope: ImapEnvelopeMeta,
): Promise<string | null> {
  const detection = detectAo(envelope.subject, '')
  const insertPayload: Record<string, unknown> = {
    user_id: userId,
    message_id: envelope.messageId,
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
  }

  let { data: inserted, error } = await db.from('emails').insert(insertPayload).select('id').single()

  if (error && (error.message.includes('attachments') || error.message.includes('has_attachments'))) {
    delete insertPayload.attachments
    delete insertPayload.has_attachments
    const retry = await db.from('emails').insert(insertPayload).select('id').single()
    inserted = retry.data
    error = retry.error
  }

  if (error) {
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
    from_address: parsed.from?.text ?? envelope.from,
    to_address: parsed.to?.text ?? envelope.to,
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

export async function syncMailAccount(
  userId: string,
  account: MailAccountWithId,
  options: { backfill?: boolean; quick?: boolean } = {},
): Promise<MailSyncResult> {
  const backfill = options.backfill === true
  const quick = options.quick === true || !backfill

  const fetchOpts = quick && !backfill
    ? { sinceDays: 90, limit: 60, minUid: account.last_sync_uid ?? 0, fullScan: false }
    : backfill
      ? { sinceDays: 180, limit: 120, minUid: 0, fullScan: true }
      : { sinceDays: 90, limit: 80, minUid: account.last_sync_uid ?? 0, fullScan: false }

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
  }

  const envelopes = await fetchEnvelopesWithFallback(account, fetchOpts)
  result.fetched = envelopes.length
  if (envelopes.length) {
    result.maxUid = Math.max(result.maxUid, ...envelopes.map(m => m.uid))
  }

  const inbound = envelopes.filter(e => !isOwnOutbound(e.from, account.imap_user))
  const existingIds = await loadExistingMessageIds(db, userId, inbound.map(e => e.messageId))

  const newEnvelopes: ImapEnvelopeMeta[] = []
  const existingEnvelopes: ImapEnvelopeMeta[] = []

  for (const envelope of inbound) {
    if (existingIds.has(envelope.messageId)) {
      existingEnvelopes.push(envelope)
    } else {
      newEnvelopes.push(envelope)
    }
  }

  result.duplicates = inbound.length - newEnvelopes.length

  // Phase 1 — insertion rapide (visible immédiatement dans Operis)
  const newEmailMap = new Map<number, string>()
  for (const envelope of newEnvelopes) {
    try {
      const emailId = await quickInsertFromEnvelope(db, userId, envelope)
      if (emailId) {
        newEmailMap.set(envelope.uid, emailId)
        result.stored++
        result.quickStored++
        if (detectAo(envelope.subject, '').isAo) result.aoDetected++
      } else {
        result.errors++
      }
    } catch (err) {
      result.errors++
      console.error('[Mail sync] quick insert error:', err)
    }
  }

  // Mise à jour AO sur emails existants (sujet seul — rapide)
  for (const envelope of existingEnvelopes) {
    const d = detectAo(envelope.subject, '')
    if (d.isAo || d.score > 0) {
      await db.from('emails')
        .update({ is_ao: d.isAo, ao_score: d.score, is_read: envelope.isRead })
        .eq('user_id', userId)
        .eq('message_id', envelope.messageId)
      result.updated++
      if (d.isAo) result.aoDetected++
    }
  }

  // Phase 2 — corps + PJ uniquement pour les nouveaux (limité pour rester < 60s)
  const uidsToEnrich = newEnvelopes.map(e => e.uid)
  const enrichLimit = quick ? 15 : 40
  const enrichUids = uidsToEnrich.slice(-enrichLimit)

  if (enrichUids.length) {
    try {
      const sources = await fetchMessageSources(account, enrichUids)
      const envelopeByUid = new Map(newEnvelopes.map(e => [e.uid, e]))

      for (const { uid, source } of sources) {
        const envelope = envelopeByUid.get(uid)
        const emailId = newEmailMap.get(uid)
        if (!envelope || !emailId) continue
        try {
          await enrichEmailFromSource(db, userId, emailId, source, envelope, account, result)
        } catch (err) {
          result.errors++
          console.error('[Mail sync] enrich error:', err)
        }
      }
    } catch (err) {
      console.error('[Mail sync] source fetch error:', err)
    }
  }

  // Phase 2b — emails déjà en base mais sans corps/PJ (réponses fournisseurs visibles sans analyse)
  if (existingEnvelopes.length) {
    const { data: recentDbEmails } = await db
      .from('emails')
      .select('id, message_id, body_text, body_html, has_attachments, attachments')
      .eq('user_id', userId)
      .order('received_at', { ascending: false })
      .limit(80)

    const incompleteByMsgId = new Map<string, string>()
    for (const em of recentDbEmails ?? []) {
      if (em.message_id && isEmailIncompleteForEnrich(em)) {
        incompleteByMsgId.set(em.message_id, em.id)
      }
    }

    const existingEnrichList: { uid: number; envelope: ImapEnvelopeMeta; emailId: string }[] = []
    for (const envelope of existingEnvelopes) {
      const emailId = incompleteByMsgId.get(envelope.messageId)
      if (emailId) existingEnrichList.push({ uid: envelope.uid, envelope, emailId })
    }

    const phase2bLimit = quick ? 10 : 25
    const toEnrichExisting = existingEnrichList.slice(0, phase2bLimit)

    if (toEnrichExisting.length) {
      try {
        const sources = await fetchMessageSources(account, toEnrichExisting.map(e => e.uid))
        const byUid = new Map(toEnrichExisting.map(e => [e.uid, e]))

        for (const { uid, source } of sources) {
          const item = byUid.get(uid)
          if (!item) continue
          try {
            await enrichEmailFromSource(db, userId, item.emailId, source, item.envelope, account, result)
            result.updated++
          } catch (err) {
            result.errors++
            console.error('[Mail sync] existing enrich error:', err)
          }
        }
      } catch (err) {
        console.error('[Mail sync] existing source fetch error:', err)
      }
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

export { formatImapError }
