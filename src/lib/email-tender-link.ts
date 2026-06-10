import type { SupabaseClient } from '@supabase/supabase-js'

const INCOMING_AO_RE = /appel d['']offres?|\bdce\b|\bdossier de consultation\b|consultation entreprises|march[eé] public|invitation [àa] (soumissionner|consulter|proposer)|cctp|dpgf|remise des offres|demande d['']offre|demande d.offre|request for (proposal|offer|quote)|invitation to bid/i
const SUPPLIER_REPLY_RE = /ponuda|notre (devis|offre)|ci-joint notre|offre de prix|proposition commerciale|devis n[°o]|facture|situation/i
const DCE_FILE_RE = /cctp|dpgf|dce|dossier de consultation|bpu|dqe|acte d.engagement/i

/** Demande AO entrante (client / maître d'ouvrage) — pas une réponse fournisseur. */
export function looksLikeIncomingAoRequest(
  subject: string,
  bodyText: string,
  isAo: boolean,
  aoScore: number,
): boolean {
  if (!isAo) return false
  const blob = `${subject}\n${bodyText}`.slice(0, 12000)
  if (SUPPLIER_REPLY_RE.test(blob)) return false
  if (INCOMING_AO_RE.test(blob)) return true
  if (DCE_FILE_RE.test(blob)) return true
  return true
}

export function looksLikeSupplierQuoteReply(
  subject: string,
  bodyText: string,
  hasDevisFile: boolean,
): boolean {
  const blob = `${subject}\n${bodyText}`.slice(0, 12000)
  if (looksLikeIncomingAoRequest(subject, bodyText, true, 50)) return false
  if (INCOMING_AO_RE.test(blob) && !SUPPLIER_REPLY_RE.test(blob)) return false
  if (DCE_FILE_RE.test(blob) && !SUPPLIER_REPLY_RE.test(blob)) return false
  if (hasDevisFile && SUPPLIER_REPLY_RE.test(blob)) return true
  if (SUPPLIER_REPLY_RE.test(blob)) return true
  if (hasDevisFile && /ponuda|devis|offre/i.test(blob)) return true
  return extractPriceFromTextQuick(blob) != null
}

function extractPriceFromTextQuick(text: string): number | null {
  const m = text.match(/(?:total|montant|ponuda|offre)[^\d]{0,30}(\d[\d\s.,]{4,})/i)
  if (!m) return null
  const n = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 100 ? n : null
}

export function isIncomingAoEmailRow(
  row: { is_ao?: boolean; ao_score?: number; subject?: string | null },
  bodySnippet = '',
): boolean {
  return looksLikeIncomingAoRequest(
    row.subject ?? '',
    bodySnippet,
    row.is_ao ?? false,
    row.ao_score ?? 0,
  )
}

/** Lien légitime : AO créé depuis cet email, ou réponse fournisseur (devis) — pas une demande AO entrante. */
export function isLegitimateTenderLink(
  emailId: string,
  tenderId: string,
  tenderSourceEmailId: string | null | undefined,
  quotePairs: Set<string>,
  incomingAo: boolean,
): boolean {
  if (tenderSourceEmailId === emailId) return true
  if (incomingAo) return false
  return quotePairs.has(`${emailId}:${tenderId}`)
}

/** Corrige tender_id en liste / détail et nettoie la base. */
export async function sanitizeEmailsTenderLinks<
  T extends { id: string; tender_id?: string | null; is_ao?: boolean; ao_score?: number; subject?: string | null },
>(
  db: SupabaseClient,
  userId: string,
  emails: T[],
): Promise<T[]> {
  const linked = emails.filter(e => e.tender_id)
  if (!linked.length) return emails

  const tenderIds = [...new Set(linked.map(e => e.tender_id!))]
  const emailIds = linked.map(e => e.id)

  const { data: tenders } = await db
    .from('tenders')
    .select('id, source_email_id')
    .eq('user_id', userId)
    .in('id', tenderIds)

  const { data: quotes } = await db
    .from('quotes')
    .select('source_email_id, tender_id')
    .in('source_email_id', emailIds)

  const tenderSource = new Map((tenders ?? []).map(t => [t.id, t.source_email_id as string | null]))
  const quotePairs = new Set(
    (quotes ?? []).map(q => `${q.source_email_id}:${q.tender_id}`),
  )

  const toClear: string[] = []
  const sanitized = emails.map(e => {
    if (!e.tender_id) return e
    const incomingAo = isIncomingAoEmailRow(e)
    const ok = isLegitimateTenderLink(
      e.id,
      e.tender_id,
      tenderSource.get(e.tender_id),
      quotePairs,
      incomingAo,
    )
    if (!ok) {
      toClear.push(e.id)
      return { ...e, tender_id: null }
    }
    return e
  })

  if (toClear.length) {
    await db.from('emails').update({ tender_id: null }).in('id', toClear).eq('user_id', userId)
  }

  return sanitized
}

export async function clearWrongTenderLinkForAoEmail(
  db: SupabaseClient,
  userId: string,
  emailId: string,
): Promise<boolean> {
  const { data: email } = await db
    .from('emails')
    .select('id, tender_id, is_ao, ao_score, subject, body_text')
    .eq('id', emailId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!email?.tender_id) return false

  const { data: tenders } = await db
    .from('tenders')
    .select('id, source_email_id')
    .eq('id', email.tender_id)
    .eq('user_id', userId)

  const { data: quotes } = await db
    .from('quotes')
    .select('source_email_id, tender_id')
    .eq('source_email_id', emailId)

  const tenderSource = new Map((tenders ?? []).map(t => [t.id, t.source_email_id as string | null]))
  const quotePairs = new Set(
    (quotes ?? []).map(q => `${q.source_email_id}:${q.tender_id}`),
  )

  const incomingAo = isIncomingAoEmailRow(email, (email.body_text ?? '').slice(0, 2000))
  const ok = isLegitimateTenderLink(
    email.id,
    email.tender_id,
    tenderSource.get(email.tender_id),
    quotePairs,
    incomingAo,
  )

  if (ok) return false

  await db.from('emails').update({ tender_id: null }).eq('id', emailId)
  return true
}

function tokenOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  const wordsB = b.toLowerCase().split(/\W+/).filter(w => w.length > 3)
  if (!wordsA.size || !wordsB.length) return 0
  let hits = 0
  for (const w of wordsB) {
    if (wordsA.has(w)) hits++
  }
  return hits
}

function scoreSubjectAgainstTender(subject: string, title: string, client: string): number {
  const subj = subject.toLowerCase()
  let score = 0
  if (title.length > 4 && subj.includes(title.toLowerCase().slice(0, 24))) score += 60
  if (client.length > 2 && subj.includes(client.toLowerCase())) score += 40
  score += tokenOverlap(title, subject) * 8
  score += tokenOverlap(client, subject) * 6
  return score
}

/** Choisit l'AO consulté qui correspond au sujet — ignore un tender_id erroné sur l'email. */
export async function resolveTenderForSupplierReply(
  db: SupabaseClient,
  userId: string,
  supplierId: string,
  subject: string,
  tenderIdHint?: string | null,
): Promise<string | null> {
  const { data: consultations } = await db
    .from('consultation_suppliers')
    .select('tender_id, tender:tenders(id, title, client)')
    .eq('supplier_id', supplierId)
    .in('status', ['envoye', 'relance', 'relance_2', 'repondu'])

  if (!consultations?.length) return null

  if (tenderIdHint) {
    const match = consultations.find(c => c.tender_id === tenderIdHint)
    const tender = match?.tender as { title?: string; client?: string } | null
    if (match && tender) {
      const score = scoreSubjectAgainstTender(subject, tender.title ?? '', tender.client ?? '')
      if (score >= 20) return tenderIdHint
    }
  }

  if (consultations.length === 1) {
    const tender = consultations[0].tender as { title?: string; client?: string } | null
    const score = scoreSubjectAgainstTender(subject, tender?.title ?? '', tender?.client ?? '')
    if (score >= 15) return consultations[0].tender_id
    return null
  }

  let bestId: string | null = null
  let bestScore = 0

  for (const c of consultations) {
    const tenderRaw = c.tender as { id: string; title?: string; client?: string } | { id: string; title?: string; client?: string }[] | null
    const tender = Array.isArray(tenderRaw) ? tenderRaw[0] : tenderRaw
    if (!tender?.id) continue
    const score = scoreSubjectAgainstTender(subject, tender.title ?? '', tender.client ?? '')
    if (score > bestScore) {
      bestScore = score
      bestId = tender.id
    }
  }

  if (bestScore >= 25) return bestId
  return null
}

export async function reconcileMislinkedAoEmails(
  db: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data: emails } = await db
    .from('emails')
    .select('id, tender_id, is_ao, ao_score, subject')
    .eq('user_id', userId)
    .not('tender_id', 'is', null)
    .limit(500)

  if (!emails?.length) return 0

  const before = emails.filter(e => e.tender_id).length
  const sanitized = await sanitizeEmailsTenderLinks(db, userId, emails)
  const afterCount = sanitized.filter(e => e.tender_id).length
  return before - afterCount
}
