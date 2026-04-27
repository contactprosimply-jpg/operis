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

const client = new ImapFlow({
  host: process.env.IMAP_HOST,
  port: 993,
  secure: true,
  auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASS },
  logger: false,
})

const AO_KEYWORDS = [
  "appel d'offres", "appel d'offre", "dce", "rfp", "consultation",
  "tender", "bid", "devis", "marché", "cahier des charges"
]

async function sync() {
  console.log('Connexion IMAP...')
  await client.connect()
  await client.mailboxOpen('INBOX')

  const messages = client.fetch('*:1', { uid: true, source: true })
  let count = 0

  for await (const message of messages) {
    if (count >= 30) break
    count++

    const parsed = await simpleParser(message.source)
    const messageId = parsed.messageId ?? `msg-${message.uid}`

    const { data: existing } = await db.from('emails').select('id').eq('message_id', messageId).single()
    if (existing) { console.log('Doublon:', parsed.subject); continue }

    const text = `${parsed.subject ?? ''} ${parsed.text ?? ''}`.toLowerCase()
    let score = 0
    for (const kw of AO_KEYWORDS) { if (text.includes(kw)) score += 20 }
    score = Math.min(100, score)

    await db.from('emails').insert({
      user_id: USER_ID,
      message_id: messageId,
      subject: parsed.subject ?? '(sans objet)',
      from_address: parsed.from?.text ?? '',
      to_address: parsed.to?.text ?? '',
      body_text: parsed.text ?? '',
      body_html: parsed.html || '',
      received_at: (parsed.date ?? new Date()).toISOString(),
      is_read: false,
      is_ao: score >= 30,
      ao_score: score,
      tender_id: null,
    })

    console.log(`✓ ${parsed.subject} (score AO: ${score})`)
  }

  await client.logout()
  console.log(`\nTerminé — ${count} emails traités`)
}

sync().catch(console.error)