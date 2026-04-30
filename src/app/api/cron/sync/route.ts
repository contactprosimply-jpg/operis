import { NextRequest } from 'next/server'
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
  { term: "consultation", weight: 25 },
  { term: "mise en concurrence", weight: 25 },
  { term: "marché", weight: 25 },
  { term: "tender", weight: 25 },
  { term: "devis", weight: 15 },
  { term: "cahier des charges", weight: 15 },
]

const NEGATIVE_KEYWORDS = [
  'reset your password', 'supabase auth', 'vercel', 'newsletter',
  'unsubscribe', 'désabonner', 'relance de paiement',
]

const OWN_SUBJECTS = ['consultation —', 'relance —', 'relance 2 —']

function detectAo(subject: string, bodyText: string) {
  const subjectLower = (subject ?? '').toLowerCase()
  const textLower = `${subject ?? ''} ${bodyText ?? ''}`.toLowerCase()
  for (const s of OWN_SUBJECTS) { if (subjectLower.startsWith(s)) return { isAo: false, score: 0 } }
  for (const neg of NEGATIVE_KEYWORDS) { if (textLower.includes(neg)) return { isAo: false, score: 0 } }
  let score = 0
  for (const { term, weight } of AO_KEYWORDS) {
    if (textLower.includes(term)) {
      score += weight
      if (subjectLower.includes(term)) score += 10
    }
  }
  return { isAo: Math.min(100, score) >= 30, score: Math.min(100, score) }
}

async function syncAccount(userId: string, account: any) {
  const db = createAdminClient()
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: true,
    auth: { user: account.imap_user, pass: account.imap_pass },
    logger: false,
  })

  let stored = 0
  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    // Emails des 3 dernières heures pour le cron (plus léger)
    const since = new Date()
    since.setHours(since.getHours() - 3)

    const messages = client.fetch({ since }, { uid: true, source: true })

    for await (const message of messages) {
      try {
        const parsed = await simpleParser(message.source)
        const messageId = parsed.messageId ?? `msg-${message.uid}`

        const fromEmail = parsed.from?.value?.[0]?.address ?? ''
        if (fromEmail === account.imap_user) continue

        const { data: existing } = await db.from('emails').select('id').eq('message_id', messageId).single()
        if (existing) continue

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

        if (!error) stored++
      } catch { continue }
    }

    await db.from('mail_accounts').update({ last_sync: new Date().toISOString() }).eq('id', account.id)
    await client.logout()
  } catch (e: any) {
    console.error(`[Cron] Erreur sync ${userId}:`, e.message)
    try { await client.logout() } catch {}
  }
  return stored
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const { data: accounts } = await db
    .from('mail_accounts')
    .select('*')
    .eq('is_active', true)

  if (!accounts?.length) {
    return Response.json({ success: true, message: 'Aucun compte actif' })
  }

  let totalStored = 0
  for (const account of accounts) {
    const stored = await syncAccount(account.user_id, account)
    totalStored += stored
  }

  console.log(`[Cron] Sync terminée — ${totalStored} nouveaux emails, ${accounts.length} comptes`)
  return Response.json({ success: true, data: { stored: totalStored, accounts: accounts.length } })
}
