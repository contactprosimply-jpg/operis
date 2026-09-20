import type { SupabaseClient } from '@supabase/supabase-js'
import type { EmailLabel } from '@/types/database'
import {
  ageInDays,
  buildPayload,
  classifyInbound,
  displayName,
  snippetOf,
  type PriorityItem,
  type PriorityKind,
  type PriorityPayload,
} from '@/lib/priorities-rules'
import { extractEmailAddress } from '@/lib/mail-attachments'

/** Fenêtre d'analyse : au-delà, un mail non traité n'est plus une priorité mais un oubli ancien. */
const LOOKBACK_DAYS = 45
const MAX_CANDIDATES = 300
const MAX_BODY_FETCH = 60

type EmailRow = {
  id: string
  subject: string | null
  from_address: string | null
  received_at: string | null
  message_id: string | null
  is_ao: boolean | null
  tender_id: string | null
  priority: string | null
  labels: EmailLabel[] | null
  has_attachments: boolean | null
}

function markedImportant(row: Pick<EmailRow, 'priority' | 'labels'>): boolean {
  if (row.priority === 'urgent') return true
  return (row.labels ?? []).some(l => /^(urgent|important)$/i.test(l.name?.trim() ?? ''))
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Colonne handled_at / table absente (migration 062 pas encore appliquée) : on dégrade en silence. */
function isMissingSchemaError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const m = (error.message ?? '').toLowerCase()
  return error.code === '42703' || error.code === '42P01' || m.includes('handled_at') || m.includes('does not exist')
}

export const EMPTY_PAYLOAD: PriorityPayload = buildPayload([])

/**
 * Ce qui reste à traiter pour l'utilisateur : devis reçus, questions des fournisseurs, mails
 * importants, AO détectés non créés. Un élément sort de la liste dès qu'il est marqué traité
 * OU qu'une réponse a été envoyée (depuis Operis ou depuis un autre client mail synchronisé).
 */
export async function collectPriorityItems(db: SupabaseClient, userId: string): Promise<PriorityPayload> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString()

  const { data: rows, error } = await db
    .from('emails')
    .select('id, subject, from_address, received_at, message_id, is_ao, tender_id, priority, labels, has_attachments')
    .eq('user_id', userId)
    .eq('mail_folder', 'inbox')
    .is('deleted_at', null)
    .is('handled_at', null)
    .gte('received_at', since)
    .order('received_at', { ascending: false })
    .limit(MAX_CANDIDATES)

  if (error) {
    if (!isMissingSchemaError(error)) console.error('[priorities] emails:', error.message)
    return EMPTY_PAYLOAD
  }
  let emails = (rows ?? []) as EmailRow[]
  if (!emails.length) return EMPTY_PAYLOAD

  // Réponse déjà envoyée (même depuis Thunderbird/Outlook, via la synchro du dossier Envoyés).
  const messageIds = emails.map(e => e.message_id).filter((m): m is string => !!m)
  const answered = new Set<string>()
  for (const ids of chunk(messageIds, 100)) {
    const { data: replies } = await db
      .from('emails')
      .select('in_reply_to')
      .eq('user_id', userId)
      .eq('mail_folder', 'sent')
      .in('in_reply_to', ids)
    for (const r of replies ?? []) if (r.in_reply_to) answered.add(r.in_reply_to as string)
  }
  emails = emails.filter(e => !e.message_id || !answered.has(e.message_id))
  if (!emails.length) return EMPTY_PAYLOAD

  // Fournisseurs (adresse principale + secondaires) → un mail reçu d'eux est une réponse fournisseur.
  const { data: suppliers } = await db
    .from('suppliers')
    .select('id, name, email, additional_emails')
    .eq('user_id', userId)
  const supplierByAddress = new Map<string, { id: string; name: string }>()
  for (const s of suppliers ?? []) {
    for (const addr of [s.email, ...((s.additional_emails as string[] | null) ?? [])]) {
      const a = extractEmailAddress(addr ?? '')
      if (a) supplierByAddress.set(a, { id: s.id as string, name: s.name as string })
    }
  }

  // Devis déjà extraits d'un mail (avec leur montant).
  const emailIds = emails.map(e => e.id)
  const quoteByEmail = new Map<string, { price: number | null; tenderId: string }>()
  for (const ids of chunk(emailIds, 100)) {
    const { data: quotes } = await db
      .from('quotes')
      .select('source_email_id, price_ht, tender_id')
      .in('source_email_id', ids)
    for (const q of quotes ?? []) {
      if (!q.source_email_id) continue
      const price = q.price_ht == null ? null : Number(q.price_ht)
      quoteByEmail.set(q.source_email_id as string, { price: Number.isFinite(price) ? price : null, tenderId: q.tender_id as string })
    }
  }

  // 1re passe (sans corps de mail) ; les mails fournisseurs restants attendent leur corps.
  const kindByEmail = new Map<string, PriorityKind>()
  const needBody: EmailRow[] = []
  for (const e of emails) {
    const from = extractEmailAddress(e.from_address ?? '')
    const supplier = from ? supplierByAddress.get(from) : undefined
    const kind = classifyInbound({
      isSupplier: !!supplier,
      hasQuoteRow: quoteByEmail.has(e.id),
      subject: e.subject,
      hasAttachments: !!e.has_attachments,
      tenderId: e.tender_id ?? quoteByEmail.get(e.id)?.tenderId ?? null,
      markedImportant: markedImportant(e),
      isAo: !!e.is_ao,
      bodyText: null,
    })
    if (kind === 'needs_body') needBody.push(e)
    else if (kind) kindByEmail.set(e.id, kind)
  }

  // Corps de mail : seulement pour les réponses fournisseur candidates à « question » (borné).
  const bodies = new Map<string, string>()
  const candidates = needBody.slice(0, MAX_BODY_FETCH)
  if (candidates.length) {
    const { data: bodyRows } = await db
      .from('emails')
      .select('id, body_text')
      .in('id', candidates.map(c => c.id))
    for (const b of bodyRows ?? []) bodies.set(b.id as string, ((b.body_text as string | null) ?? '').slice(0, 6000))
  }
  for (const e of candidates) {
    const from = extractEmailAddress(e.from_address ?? '')
    const supplier = from ? supplierByAddress.get(from) : undefined
    const kind = classifyInbound({
      isSupplier: !!supplier,
      hasQuoteRow: false,
      subject: e.subject,
      hasAttachments: !!e.has_attachments,
      tenderId: e.tender_id,
      markedImportant: markedImportant(e),
      isAo: !!e.is_ao,
      bodyText: bodies.get(e.id) ?? '',
    })
    if (kind && kind !== 'needs_body') kindByEmail.set(e.id, kind)
  }

  const kept = emails.filter(e => kindByEmail.has(e.id))
  if (!kept.length) return EMPTY_PAYLOAD

  // Titres d'AO et meilleur prix par AO.
  const tenderIds = Array.from(new Set(kept.map(e => e.tender_id ?? quoteByEmail.get(e.id)?.tenderId).filter((t): t is string => !!t)))
  const tenderTitle = new Map<string, string>()
  const bestPrice = new Map<string, number>()
  if (tenderIds.length) {
    const { data: tenders } = await db.from('tenders').select('id, title').in('id', tenderIds)
    for (const t of tenders ?? []) tenderTitle.set(t.id as string, t.title as string)
    const { data: allQuotes } = await db.from('quotes').select('tender_id, price_ht').in('tender_id', tenderIds)
    for (const q of allQuotes ?? []) {
      const p = q.price_ht == null ? NaN : Number(q.price_ht)
      if (!Number.isFinite(p) || p <= 0) continue
      const cur = bestPrice.get(q.tender_id as string)
      if (cur === undefined || p < cur) bestPrice.set(q.tender_id as string, p)
    }
  }

  const items: PriorityItem[] = kept.map(e => {
    const kind = kindByEmail.get(e.id)!
    const from = extractEmailAddress(e.from_address ?? '')
    const supplier = from ? supplierByAddress.get(from) : undefined
    const q = quoteByEmail.get(e.id)
    const tenderId = e.tender_id ?? q?.tenderId ?? null
    const receivedAt = e.received_at ?? new Date().toISOString()
    return {
      emailId: e.id,
      kind,
      subject: e.subject ?? '(sans objet)',
      fromName: displayName(e.from_address),
      fromAddress: from ?? '',
      receivedAt,
      ageDays: ageInDays(receivedAt),
      tenderId,
      tenderTitle: tenderId ? tenderTitle.get(tenderId) ?? null : null,
      supplierName: supplier?.name ?? null,
      snippet: snippetOf(bodies.get(e.id)),
      price: q?.price ?? null,
      isBestPrice: !!(q?.price && tenderId && bestPrice.get(tenderId) === q.price),
    }
  })

  return buildPayload(items)
}

/** Marque un mail comme traité (ou annule). Silencieux si la colonne n'existe pas encore. */
export async function setEmailHandled(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  handled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await db
    .from('emails')
    .update({ handled_at: handled ? new Date().toISOString() : null })
    .eq('id', emailId)
    .eq('user_id', userId)
    .select('id')
  if (error) {
    if (isMissingSchemaError(error)) return { ok: false, error: 'Fonction indisponible (migration 062 à appliquer)' }
    return { ok: false, error: error.message }
  }
  if (!data?.length) return { ok: false, error: 'Mail introuvable' }
  return { ok: true }
}

/** À appeler après une réponse envoyée / un devis validé : jamais bloquant pour l'action principale. */
export async function markEmailHandledQuietly(db: SupabaseClient, userId: string, emailId: string | null | undefined): Promise<void> {
  if (!emailId) return
  try {
    await setEmailHandled(db, userId, emailId, true)
  } catch (e) {
    console.error('[priorities] markEmailHandledQuietly:', e instanceof Error ? e.message : e)
  }
}
