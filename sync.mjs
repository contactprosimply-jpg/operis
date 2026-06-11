// ============================================================
// OPERIS — sync.mjs — Sync IMAP (chef Famille + membres)
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

const OWNER_ID = process.env.SYNC_OWNER_ID || '46dc77c8-f312-4714-b59c-a7d9c693372f'

const AO_KEYWORDS = [
  { term: "appel d'offres", weight: 40 },
  { term: "appel d'offre", weight: 40 },
  { term: 'dce', weight: 40 },
  { term: 'dossier de consultation', weight: 40 },
  { term: 'rfp', weight: 35 },
  { term: 'request for proposal', weight: 35 },
  { term: 'consultation', weight: 25 },
  { term: 'mise en concurrence', weight: 25 },
  { term: 'tender', weight: 25 },
  { term: 'bid', weight: 20 },
  { term: 'devis', weight: 15 },
  { term: 'cahier des charges', weight: 15 },
  { term: 'cctp', weight: 15 },
  { term: 'dpgf', weight: 15 },
  { term: 'date limite de réponse', weight: 15 },
  { term: 'remise des offres', weight: 15 },
]

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

const OWN_SUBJECTS = [
  'consultation —',
  'relance —',
  'relance 2 —',
]

function detectAo(subject, bodyText) {
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

function memberDisplayName(member) {
  return member.display_name?.trim() || member.email?.split('@')[0] || 'Membre'
}

async function getFamilySyncTargets(ownerId) {
  const targets = [{ userId: ownerId, sourceMemberId: null, sourceMemberName: null }]

  const { data: org } = await db
    .from('organizations')
    .select('id')
    .eq('owner_id', ownerId)
    .maybeSingle()

  if (!org) return targets

  const { data: members } = await db
    .from('organization_members')
    .select('user_id, display_name, email')
    .eq('organization_id', org.id)

  for (const row of members ?? []) {
    if (row.user_id === ownerId) continue
    targets.push({
      userId: row.user_id,
      sourceMemberId: row.user_id,
      sourceMemberName: memberDisplayName(row),
    })
  }

  return targets
}

async function syncUserMailbox(target) {
  const { data: account } = await db
    .from('mail_accounts')
    .select('*')
    .eq('user_id', target.userId)
    .eq('is_active', true)
    .maybeSingle()

  if (!account) {
    console.log(`— Pas de compte mail pour ${target.userId}`)
    return { count: 0, stored: 0, duplicates: 0, aoCount: 0 }
  }

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port || 993,
    secure: true,
    auth: { user: account.imap_user, pass: account.imap_pass },
    logger: false,
  })

  const ownEmail = account.imap_user?.toLowerCase()
  let count = 0
  let stored = 0
  let duplicates = 0
  let aoCount = 0

  console.log(`\nSync ${account.imap_user} (${target.sourceMemberName ?? 'chef'})...`)

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    const since = new Date()
    since.setDate(since.getDate() - 30)

    const messages = client.fetch({ since }, { uid: true, source: true })

    for await (const message of messages) {
      count++
      try {
        const parsed = await simpleParser(message.source)
        const messageId = parsed.messageId ?? `msg-${target.userId}-${message.uid}`

        const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase() ?? ''
        if (ownEmail && fromEmail === ownEmail) {
          duplicates++
          continue
        }

        const { data: existing } = await db
          .from('emails')
          .select('id')
          .eq('user_id', target.userId)
          .eq('message_id', messageId)
          .maybeSingle()

        if (existing) {
          duplicates++
          continue
        }

        const { isAo, score } = detectAo(parsed.subject, parsed.text)

        const insertPayload = {
          user_id: target.userId,
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
        }

        if (target.sourceMemberId) {
          insertPayload.source_member_id = target.sourceMemberId
          insertPayload.source_member_name = target.sourceMemberName
        }

        const { error } = await db.from('emails').insert(insertPayload)
        if (error) {
          console.log(`✗ Erreur: ${parsed.subject} — ${error.message}`)
          continue
        }

        stored++
        if (isAo) {
          aoCount++
          console.log(`🔔 AO: ${parsed.subject} (score: ${score})`)
        }
      } catch {
        continue
      }
    }

    await client.logout()

    await db
      .from('mail_accounts')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', account.id)
  } catch (err) {
    console.error(`Erreur IMAP ${account.imap_user}:`, err.message)
  }

  console.log(`  Trouvés: ${count} | Stockés: ${stored} | AO: ${aoCount} | Doublons: ${duplicates}`)
  return { count, stored, duplicates, aoCount }
}

function supabaseHost() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').host || '(URL manquante)'
  } catch {
    return '(URL invalide)'
  }
}

async function main() {
  const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development'
  console.log(`Operis sync — owner ${OWNER_ID}`)
  console.log(`Supabase: ${supabaseHost()} (APP_ENV=${appEnv})`)
  const targets = await getFamilySyncTargets(OWNER_ID)
  let totalStored = 0
  let totalAo = 0

  for (const target of targets) {
    const r = await syncUserMailbox(target)
    totalStored += r.stored
    totalAo += r.aoCount
  }

  console.log(`\n--- Résumé global ---`)
  console.log(`Comptes synchronisés : ${targets.length}`)
  console.log(`Emails stockés       : ${totalStored}`)
  console.log(`AO détectés          : ${totalAo}`)
}

main().catch(console.error)
