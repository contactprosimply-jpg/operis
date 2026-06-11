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

function normalizeMessageId(raw, fallback) {
  const trimmed = raw?.trim()
  if (!trimmed) return fallback ?? `uid-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const bare = trimmed.replace(/^<|>$/g, '')
  if (!bare) return trimmed
  return bare.includes('@') ? `<${bare}>` : bare
}

function isDuplicateKeyError(msg) {
  return msg?.includes('duplicate key') || msg?.includes('23505')
}

async function resolveSourceMeta(userId, ownerId) {
  if (!ownerId || userId === ownerId) {
    return { sourceMemberId: null, sourceMemberName: null }
  }
  const { data: org } = await db
    .from('organizations')
    .select('id')
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (!org) return { sourceMemberId: null, sourceMemberName: null }

  const { data: m } = await db
    .from('organization_members')
    .select('display_name, email')
    .eq('organization_id', org.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!m) return { sourceMemberId: null, sourceMemberName: null }
  return { sourceMemberId: userId, sourceMemberName: memberDisplayName(m) }
}

async function getSyncTargets(ownerId) {
  const { data: accounts } = await db
    .from('mail_accounts')
    .select('id, user_id, imap_user')
    .eq('is_active', true)
    .order('imap_user')

  if (!accounts?.length) return []

  if (process.env.SYNC_USER_ID) {
    return accounts
      .filter(a => a.user_id === process.env.SYNC_USER_ID)
      .map(a => ({
        accountId: a.id,
        userId: a.user_id,
        imapUser: a.imap_user,
        sourceMemberId: null,
        sourceMemberName: null,
      }))
  }

  if (process.env.SYNC_FAMILY_ONLY === 'true') {
    const allowed = new Set()
    const { data: org } = await db
      .from('organizations')
      .select('id')
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (org) {
      allowed.add(ownerId)
      const { data: members } = await db
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', org.id)
      for (const m of members ?? []) allowed.add(m.user_id)
    } else {
      allowed.add(ownerId)
    }
    const familyTargets = []
    for (const a of accounts.filter(x => allowed.has(x.user_id))) {
      const meta = await resolveSourceMeta(a.user_id, ownerId)
      familyTargets.push({
        accountId: a.id,
        userId: a.user_id,
        imapUser: a.imap_user,
        ...meta,
      })
    }
    return familyTargets
  }

  // Par défaut : tous les comptes IMAP actifs (un sync par ligne mail_accounts)
  const targets = []
  for (const a of accounts) {
    targets.push({
      accountId: a.id,
      userId: a.user_id,
      imapUser: a.imap_user,
      sourceMemberId: null,
      sourceMemberName: null,
    })
  }
  return targets
}

async function printMailAccountDiagnostics() {
  const { data: accounts } = await db
    .from('mail_accounts')
    .select('user_id, imap_user')
    .eq('is_active', true)

  const imapDupes = new Map()
  for (const a of accounts ?? []) {
    const key = (a.imap_user ?? '').toLowerCase()
    if (!imapDupes.has(key)) imapDupes.set(key, [])
    imapDupes.get(key).push(a.user_id)
  }

  console.log('\n--- Comptes mail configurés ---')
  for (const a of accounts ?? []) {
    const { data: { user } } = await db.auth.admin.getUserById(a.user_id)
    const { count } = await db
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', a.user_id)
    console.log(
      `  IMAP ${a.imap_user} → user_id ${a.user_id} (login ${user?.email ?? '?'}) · ${count ?? 0} emails en base`,
    )
  }

  for (const [imap, userIds] of imapDupes) {
    if (userIds.length > 1) {
      console.log(`  ⚠ Doublon IMAP ${imap} sur ${userIds.length} comptes Operis — ne configurez la même boîte qu’une fois`)
    }
  }

  console.log('  → Ma boîte = mails du compte Operis avec lequel vous êtes connecté.\n')
}

async function* iterateMailboxMessages(client) {
  const uids = new Set()

  const since30 = new Date()
  since30.setDate(since30.getDate() - 30)

  try {
    const unseen = await client.search({ seen: false }, { uid: true })
    if (Array.isArray(unseen) && unseen.length) {
      for await (const message of client.fetch(unseen, { uid: true, source: true }, { uid: true })) {
        if (!uids.has(message.uid)) {
          uids.add(message.uid)
          yield message
        }
      }
    }
  } catch { /* seen:false non supporté */ }

  for await (const message of client.fetch({ since: since30 }, { uid: true, source: true })) {
    if (!uids.has(message.uid)) {
      uids.add(message.uid)
      yield message
    }
  }
}

async function syncUserMailbox(target) {
  const { data: account } = await db
    .from('mail_accounts')
    .select('*')
    .eq('id', target.accountId)
    .eq('is_active', true)
    .maybeSingle()

  if (!account) {
    console.log(`— Compte mail introuvable (${target.imapUser ?? target.userId})`)
    return { count: 0, stored: 0, updated: 0, duplicates: 0, aoCount: 0 }
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
  let updated = 0
  let duplicates = 0
  let aoCount = 0

  const { count: dbCount } = await db
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', target.userId)

  console.log(`\nSync ${account.imap_user} → user_id ${target.userId} (${target.sourceMemberName ?? 'chef'}) · ${dbCount ?? 0} en base`)

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    for await (const message of iterateMailboxMessages(client)) {
      count++
      try {
        const parsed = await simpleParser(message.source)
        const messageId = normalizeMessageId(parsed.messageId, `msg-${target.userId}-${message.uid}`)

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

        const { isAo, score } = detectAo(parsed.subject, parsed.text)
        const patch = {
          subject: parsed.subject ?? '(sans objet)',
          from_address: parsed.from?.text ?? '',
          to_address: parsed.to?.text ?? '',
          body_text: parsed.text ?? '',
          body_html: parsed.html || '',
          received_at: (parsed.date ?? new Date()).toISOString(),
          is_ao: isAo,
          ao_score: score,
        }

        if (existing) {
          await db.from('emails').update(patch).eq('id', existing.id)
          updated++
          duplicates++
          continue
        }

        const { data: globalDup } = await db
          .from('emails')
          .select('id, user_id')
          .eq('message_id', messageId)
          .maybeSingle()

        if (globalDup) {
          if (globalDup.user_id !== target.userId) {
            duplicates++
            continue
          }
          await db.from('emails').update(patch).eq('id', globalDup.id)
          updated++
          duplicates++
          continue
        }

        const insertPayload = {
          user_id: target.userId,
          message_id: messageId,
          ...patch,
          is_read: false,
          tender_id: null,
        }

        if (target.sourceMemberId) {
          insertPayload.source_member_id = target.sourceMemberId
          insertPayload.source_member_name = target.sourceMemberName
        }

        let { error } = await db.from('emails').insert(insertPayload)
        if (error && (error.message.includes('source_member') || error.message.includes('does not exist'))) {
          delete insertPayload.source_member_id
          delete insertPayload.source_member_name
          const retry = await db.from('emails').insert(insertPayload)
          error = retry.error
        }
        if (error) {
          if (isDuplicateKeyError(error.message)) {
            duplicates++
            continue
          }
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

  console.log(`  Trouvés: ${count} | Nouveaux: ${stored} | Mis à jour: ${updated} | AO: ${aoCount} | Déjà en base: ${duplicates}`)
  return { count, stored, updated, duplicates, aoCount }
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
  console.log(`Operis sync — tous les comptes IMAP actifs (réf. owner ${OWNER_ID})`)
  console.log(`Supabase: ${supabaseHost()} (APP_ENV=${appEnv})`)
  console.log('Contrainte message_id : si erreurs duplicate key → exécuter supabase/migrations/013_fix_emails_message_id_unique.sql')
  await printMailAccountDiagnostics()
  const targets = await getSyncTargets(OWNER_ID)
  if (!targets.length) {
    console.log('Aucun compte mail actif. Configurez Paramètres → Messagerie dans Operis.')
    return
  }
  let totalStored = 0
  let totalUpdated = 0
  let totalAo = 0

  for (const target of targets) {
    const r = await syncUserMailbox(target)
    totalStored += r.stored
    totalUpdated += r.updated ?? 0
    totalAo += r.aoCount
  }

  console.log(`\n--- Résumé global ---`)
  console.log(`Comptes synchronisés : ${targets.length}`)
  console.log(`Nouveaux emails      : ${totalStored}`)
  console.log(`Emails mis à jour    : ${totalUpdated}`)
  console.log(`AO détectés          : ${totalAo}`)
  if (totalStored === 0 && totalUpdated > 0) {
    console.log('→ Boîte rafraîchie (contenu existant mis à jour). Rechargez Messagerie dans Operis.')
  }
}

main().catch(console.error)
