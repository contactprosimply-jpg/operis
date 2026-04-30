export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export const maxDuration = 60

const AO_KEYWORDS = [
  { term: "appel d'offres", weight: 40 },
  { term: "appel d'offre", weight: 40 },
  { term: "dce", weight: 40 },
  { term: "dossier de consultation", weight: 40 },
  { term: "rfp", weight: 35 },
  { term: "request for proposal", weight: 35 },
  { term: "consultation", weight: 25 },
  { term: "mise en concurrence", weight: 25 },
  { term: "marchÃ©", weight: 25 },
  { term: "tender", weight: 25 },
  { term: "bid", weight: 20 },
  { term: "devis", weight: 15 },
  { term: "cahier des charges", weight: 15 },
  { term: "cctp", weight: 15 },
  { term: "dpgf", weight: 15 },
  { term: "date limite de rÃ©ponse", weight: 15 },
  { term: "remise des offres", weight: 15 },
]

const NEGATIVE_KEYWORDS = [
  'reset your password', 'supabase auth', 'vercel', 'newsletter',
  'unsubscribe', 'dÃ©sabonner', 'relance de paiement', 'offre spÃ©ciale',
]

const OWN_SUBJECTS = ['consultation â€”', 'relance â€”', 'relance 2 â€”']

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

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()

  const { data: account, error: accountError } = await db
    .from('mail_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  if (accountError || !account) {
    return Response.json({
      success: false,
      error: 'Aucun compte mail configurÃ©. Va dans ParamÃ¨tres > Messagerie.'
    }, { status: 400 })
  }

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: true,
    auth: { user: account.imap_user, pass: account.imap_pass },
    logger: false,
  })

  const result = { fetched: 0, stored: 0, aoDetected: 0, duplicates: 0, errors: 0 }

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    // RÃ©cupÃ©rer les 30 derniers jours
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const messages = client.fetch({ since }, { uid: true, source: true })

    for await (const message of messages) {
      result.fetched++
      try {
        const parsed = await simpleParser(message.source)
        const messageId = parsed.messageId ?? `msg-${message.uid}`

        // Ignorer nos propres envois
        const fromEmail = parsed.from?.value?.[0]?.address ?? ''
        if (fromEmail === account.imap_user) { result.duplicates++; continue }

        // VÃ©rifier doublon
        const { data: existing } = await db
          .from('emails')
          .select('id')
          .eq('message_id', messageId)
          .single()

        if (existing) { result.duplicates++; continue }

        const { isAo, score } = detectAo(parsed.subject ?? '', parsed.text ?? '')

        const { error } = await db.from('emails').insert({
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
        })

        if (error) { result.errors++; continue }

        result.stored++
        if (isAo) result.aoDetected++

      } catch { result.errors++ }
    }

    // Mettre Ã  jour last_sync
    await db
      .from('mail_accounts')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', account.id)

    await client.logout()
    return Response.json({ success: true, data: result })

  } catch (e: any) {
    try { await client.logout() } catch {}
    return Response.json({ success: false, error: `Erreur IMAP: ${e.message}` }, { status: 500 })
  }
}

