// ============================================================
// OPERIS — sync.mjs — VERSION AMÉLIORÉE
// Synchro IMAP + détection AO affinée
// ============================================================

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const USER_ID = '46dc77c8-f312-4714-b59c-a7d9c693372f'

// Email expéditeur Operis — on ignore nos propres envois
const OWN_EMAIL = process.env.IMAP_USER

const client = new ImapFlow({
  host: process.env.IMAP_HOST,
  port: 993,
  secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
  logger: false,
})

// Mots clés positifs avec poids
const AO_KEYWORDS = [
  { term: "appel d'offres", weight: 40 },
  { term: "appel d'offre", weight: 40 },
  { term: "dce", weight: 40 },
  { term: "dossier de consultation", weight: 40 },
  { term: "rfp", weight: 35 },
  { term: "request for proposal", weight: 35 },
  { term: "consultation", weight: 25 },
  { term: "mise en concurrence", weight: 25 },
  { term: "tender", weight: 25 },
  { term: "bid", weight: 20 },
  { term: "devis", weight: 15 },
  { term: "cahier des charges", weight: 15 },
  { term: "cctp", weight: 15 },
  { term: "dpgf", weight: 15 },
  { term: "date limite de réponse", weight: 15 },
  { term: "remise des offres", weight: 15 },
]

// Mots clés négatifs — on ignore ces emails
const NEGATIVE_KEYWORDS = [
  'reset your password',
  'supabase auth',
  'vercel',
  'newsletter',
  'unsubscribe',
  'désabonner',
  'facture',
  'paiement',
  'relance de paiement',
]

// Exclure nos propres emails de consultation/relance
const OWN_SUBJECTS = [
  'consultation —',
  'relance —',
  'relance 2 —',
]

function detectAo(subject, bodyText) {
  const subjectLower = (subject ?? '').toLowerCase()
  const textLower = `${subject ?? ''} ${bodyText ?? ''}`.toLowerCase()

  // Ignorer nos propres envois
  for (const s of OWN_SUBJECTS) {
    if (subjectLower.startsWith(s)) return { isAo: false, score: 0 }
  }

  // Mots clés négatifs
  for (const neg of NEGATIVE_KEYWORDS) {
    if (textLower.includes(neg)) return { isAo: false, score: 0 }
  }

  let score = 0

  for (const { term, weight } of AO_KEYWORDS) {
    if (textLower.includes(term)) {
      score += weight
      // Bonus si dans le sujet
      if (subjectLower.includes(term)) score += 10
    }
  }

  score = Math.min(100, score)
  return { isAo: score >= 30, score }
}

async function sync() {
  console.log('Connexion IMAP...')
  await client.connect()
  await client.mailboxOpen('INBOX')

  // Emails du dernier mois
  const since = new Date()
  since.setDate(since.getDate() - 30)

  console.log(`Récupération des emails depuis le ${since.toLocaleDateString('fr-FR')}...`)

  const messages = client.fetch({ since }, { uid: true, source: true })
  let count = 0, stored = 0, duplicates = 0, aoCount = 0

  for await (const message of messages) {
    count++
    try {
      const parsed = await simpleParser(message.source)
      const messageId = parsed.messageId ?? `msg-${message.uid}`

      // Ignorer nos propres envois
      const fromEmail = parsed.from?.value?.[0]?.address ?? ''
      if (fromEmail === OWN_EMAIL) { duplicates++; continue }

      const { data: existing } = await db.from('emails').select('id').eq('message_id', messageId).single()
      if (existing) { duplicates++; continue }

      const { isAo, score } = detectAo(parsed.subject, parsed.text)

      const { error } = await db.from('emails').insert({
        user_id: USER_ID,
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

      if (error) { console.log(`✗ Erreur: ${parsed.subject}`); continue }

      stored++
      if (isAo) {
        aoCount++
        console.log(`🔔 AO: ${parsed.subject} (score: ${score})`)
      }

    } catch { continue }
  }

  await client.logout()
  console.log(`\n--- Résumé ---`)
  console.log(`Emails trouvés  : ${count}`)
  console.log(`Stockés         : ${stored}`)
  console.log(`AO détectés     : ${aoCount}`)
  console.log(`Doublons/ignorés: ${duplicates}`)
}

sync().catch(console.error)
