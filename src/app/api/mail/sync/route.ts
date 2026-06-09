export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { fetchRecentMessages, formatImapError, type MailAccountConfig } from '@/lib/imap-client'
import { simpleParser } from 'mailparser'
import { parseMailAttachments } from '@/lib/mail-attachments'
import { tryCreateQuoteFromInboundEmail } from '@/lib/mail-quote-extract'

export const maxDuration = 60

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

async function resolveMailAccount(userId: string): Promise<(MailAccountConfig & { id?: string }) | null> {
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
    }
  }

  if (process.env.IMAP_USER && process.env.IMAP_PASS) {
    return {
      imap_host: process.env.IMAP_HOST || 'mail.gandi.net',
      imap_port: Number(process.env.IMAP_PORT) || 993,
      imap_user: process.env.IMAP_USER,
      imap_pass: process.env.IMAP_PASS,
    }
  }

  return null
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

async function fetchMessagesWithFallback(account: MailAccountConfig & { id?: string }) {
  try {
    return await fetchRecentMessages(account, { sinceDays: 30, limit: 40 })
  } catch (primaryError) {
    const envAccount = getEnvMailAccount()
    if (!envAccount) throw primaryError
    const sameConfig =
      envAccount.imap_host === account.imap_host &&
      envAccount.imap_port === account.imap_port &&
      envAccount.imap_user === account.imap_user &&
      envAccount.imap_pass === account.imap_pass
    if (sameConfig) throw primaryError
    return fetchRecentMessages(envAccount, { sinceDays: 30, limit: 40 })
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const account = await resolveMailAccount(userId)
  if (!account) {
    return Response.json({
      success: false,
      error: 'Aucun compte mail configure. Va dans Parametres > Messagerie.',
    }, { status: 400 })
  }

  const db = createAdminClient()
  const result = { fetched: 0, stored: 0, aoDetected: 0, duplicates: 0, errors: 0 }

  try {
    const messages = await fetchMessagesWithFallback(account)
    result.fetched = messages.length

    for (const message of messages) {
      try {
        const parsed = await simpleParser(message.source)
        const messageId = parsed.messageId ?? `msg-${message.uid}`

        const fromEmail = parsed.from?.value?.[0]?.address ?? ''
        if (fromEmail.toLowerCase() === account.imap_user.toLowerCase()) {
          result.duplicates++
          continue
        }

        const { data: existing } = await db
          .from('emails')
          .select('id')
          .eq('message_id', messageId)
          .maybeSingle()

        if (existing) {
          result.duplicates++
          continue
        }

        const { isAo, score } = detectAo(parsed.subject ?? '', parsed.text ?? '')
        const { attachments, hasAttachments } = parseMailAttachments(parsed.attachments)

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
          attachments,
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
          continue
        }

        if (inserted?.id) {
          await tryCreateQuoteFromInboundEmail(
            db,
            userId,
            inserted.id,
            parsed.from?.text ?? '',
            parsed.text ?? '',
            attachments,
            null
          )
        }

        result.stored++
        if (isAo) result.aoDetected++
      } catch {
        result.errors++
      }
    }

    if (account.id) {
      await db
        .from('mail_accounts')
        .update({ last_sync: new Date().toISOString() })
        .eq('id', account.id)
    }

    return Response.json({ success: true, data: result })
  } catch (e) {
    return Response.json({
      success: false,
      error: `Erreur IMAP: ${formatImapError(e)}`,
    }, { status: 500 })
  }
}
