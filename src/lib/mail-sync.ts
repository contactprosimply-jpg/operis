import { simpleParser } from 'mailparser'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchRecentMessages, formatImapError, type MailAccountConfig } from '@/lib/imap-client'
import { parseMailAttachments, extractEmailAddress, type StoredEmailAttachment } from '@/lib/mail-attachments'
import { tryCreateQuoteFromInboundEmail } from '@/lib/mail-quote-extract'
import { attachmentMetaOnly, persistAttachmentsToStorage } from '@/lib/mail-storage'
import { createAdminClient } from '@/lib/supabase'

const AO_KEYWORDS = [
  { term: "appel d'offres", weight: 40 },
  { term: "appel d'offre", weight: 40 },
  { term: 'dce', weight: 40 },
  { term: 'dossier de consultation', weight: 40 },
  { term: 'rfp', weight: 35 },
  { term: 'request for proposal', weight: 35 },
  { term: 'consultation', weight: 25 },
  { term: 'mise en concurrence', weight: 25 },
  { term: 'marche', weight: 25 },
  { term: 'tender', weight: 25 },
  { term: 'bid', weight: 20 },
  { term: 'devis', weight: 15 },
  { term: 'cahier des charges', weight: 15 },
  { term: 'cctp', weight: 15 },
  { term: 'dpgf', weight: 15 },
  { term: 'date limite de reponse', weight: 15 },
  { term: 'remise des offres', weight: 15 },
]

const NEGATIVE_KEYWORDS = [
  'reset your password', 'supabase auth', 'vercel', 'newsletter',
  'unsubscribe', 'desabonner', 'relance de paiement', 'offre speciale',
]

const OWN_SUBJECTS = ['consultation —', 'relance —', 'relance 2 —']

export interface MailSyncResult {
  fetched: number
  stored: number
  updated: number
  aoDetected: number
  duplicates: number
  errors: number
  maxUid: number
}

export type MailAccountWithId = MailAccountConfig & {
  id?: string
  last_sync_uid?: number | null
}

function detectAo(subject: string, bodyText: string) {
  const subjectLower = (subject ?? '').toLowerCase()
  const textLower = `${subject ?? ''} ${bodyText ?? ''}`.toLowerCase()

  for (const s of OWN_SUBJECTS) {
    if (subjectLower.startsWith(s)) return { isAo: false, score: 0 }
  }
  for (const neg of NEGATIVE_KEYWORDS) {
    if (textLower.includes(neg)) return { isAo: false, score: 0 }
  }

  let score = 0
  for (const { term, weight } of AO_KEYWORDS) {
    if (textLower.includes(term)) {
      score += weight
      if (subjectLower.includes(term)) score += 10
    }
  }
  score = Math.min(100, score)
  return { isAo: score >= 30, score }
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

async function fetchMessagesWithFallback(
  account: MailAccountWithId,
  opts: { sinceDays: number; limit: number; minUid?: number },
) {
  try {
    return await fetchRecentMessages(account, opts)
  } catch (primaryError) {
    const envAccount = getEnvMailAccount()
    if (!envAccount) throw primaryError
    const sameConfig =
      envAccount.imap_host === account.imap_host &&
      envAccount.imap_port === account.imap_port &&
      envAccount.imap_user === account.imap_user &&
      envAccount.imap_pass === account.imap_pass
    if (sameConfig) throw primaryError
    return fetchRecentMessages(envAccount, opts)
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

export async function syncMailAccount(
  userId: string,
  account: MailAccountWithId,
  options: { backfill?: boolean } = {},
): Promise<MailSyncResult> {
  const backfill = options.backfill === true
  const fetchOpts = backfill
    ? { sinceDays: 120, limit: 150, minUid: 0 }
    : {
        sinceDays: 60,
        limit: 80,
        minUid: backfill ? 0 : (account.last_sync_uid ?? 0),
      }

  const db = createAdminClient()
  const result: MailSyncResult = {
    fetched: 0,
    stored: 0,
    updated: 0,
    aoDetected: 0,
    duplicates: 0,
    errors: 0,
    maxUid: account.last_sync_uid ?? 0,
  }

  const messages = await fetchMessagesWithFallback(account, fetchOpts)
  result.fetched = messages.length
  if (messages.length) {
    result.maxUid = Math.max(result.maxUid, ...messages.map(m => m.uid))
  }

  for (const message of messages) {
    try {
      const parsed = await simpleParser(message.source)
      const messageId = parsed.messageId ?? `uid-${account.imap_user}-${message.uid}`

      if (isOwnOutbound(parsed.from?.text ?? '', account.imap_user)) {
        result.duplicates++
        continue
      }

      const { attachments, hasAttachments } = parseMailAttachments(parsed.attachments)

      const { data: existing } = await db
        .from('emails')
        .select('id, has_attachments, user_id')
        .eq('message_id', messageId)
        .maybeSingle()

      if (existing) {
        if (existing.user_id !== userId) {
          result.errors++
          console.error('[Mail sync] message_id conflict:', messageId)
          continue
        }
        if (hasAttachments) {
          await saveEmailAttachments(db, userId, existing.id, attachments)
          result.updated++
        } else {
          result.duplicates++
        }
        continue
      }

      const { isAo, score } = detectAo(parsed.subject ?? '', parsed.text ?? '')

      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        message_id: messageId,
        subject: parsed.subject ?? '(sans objet)',
        from_address: parsed.from?.text ?? '',
        to_address: parsed.to?.text ?? '',
        body_text: parsed.text ?? '',
        body_html: parsed.html || '',
        received_at: (parsed.date ?? new Date()).toISOString(),
        is_read: false,
        is_ao: isAo,
        ao_score: score,
        tender_id: null,
        attachments: [],
        has_attachments: hasAttachments,
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
        result.errors++
        console.error('[Mail sync] insert error:', error.message, parsed.subject)
        continue
      }

      if (inserted?.id) {
        let savedAttachments = attachments
        if (hasAttachments) {
          savedAttachments = await saveEmailAttachments(db, userId, inserted.id, attachments)
        }
        try {
          await tryCreateQuoteFromInboundEmail(
            db,
            userId,
            inserted.id,
            parsed.from?.text ?? '',
            parsed.text ?? '',
            savedAttachments,
            null,
          )
        } catch (quoteErr) {
          console.error('[Mail sync] quote extract:', quoteErr)
        }
      }

      result.stored++
      if (isAo) result.aoDetected++
    } catch (err) {
      result.errors++
      console.error('[Mail sync] message error:', err)
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
