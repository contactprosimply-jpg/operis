import type { SupabaseClient } from '@supabase/supabase-js'

const INCOMING_AO_RE = /appel d['']offres?|\bdce\b|\bdossier de consultation\b|consultation entreprises|march[eé] public|invitation [àa] (soumissionner|consulter|proposer)|cctp|dpgf|remise des offres/i
const SUPPLIER_REPLY_RE = /ponuda|notre (devis|offre)|ci-joint notre|offre de prix|proposition commerciale|devis n[°o]|facture|situation/i

/** Demande AO entrante (client / maître d'ouvrage) — pas une réponse fournisseur. */
export function looksLikeIncomingAoRequest(
  subject: string,
  bodyText: string,
  isAo: boolean,
  aoScore: number,
): boolean {
  if (!isAo || aoScore < 30) return false
  const blob = `${subject}\n${bodyText}`.slice(0, 8000)
  if (SUPPLIER_REPLY_RE.test(blob)) return false
  if (INCOMING_AO_RE.test(blob)) return true
  return aoScore >= 50
}

export function looksLikeSupplierQuoteReply(
  subject: string,
  bodyText: string,
  hasDevisFile: boolean,
): boolean {
  if (hasDevisFile) return true
  const blob = `${subject}\n${bodyText}`.slice(0, 8000)
  if (SUPPLIER_REPLY_RE.test(blob)) return true
  return extractPriceFromTextQuick(blob) != null
}

function extractPriceFromTextQuick(text: string): number | null {
  const m = text.match(/(?:total|montant|ponuda|offre)[^\d]{0,30}(\d[\d\s.,]{4,})/i)
  if (!m) return null
  const n = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 100 ? n : null
}

/** Un email AO ne doit être lié qu'à l'AO créé depuis cet email (source_email_id). */
export async function clearWrongTenderLinkForAoEmail(
  db: SupabaseClient,
  userId: string,
  emailId: string,
): Promise<boolean> {
  const { data: email } = await db
    .from('emails')
    .select('id, tender_id, is_ao, ao_score')
    .eq('id', emailId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!email?.tender_id) return false

  const { data: tender } = await db
    .from('tenders')
    .select('id, source_email_id')
    .eq('id', email.tender_id)
    .eq('user_id', userId)
    .maybeSingle()

  const { data: quoteSource } = await db
    .from('quotes')
    .select('id')
    .eq('source_email_id', emailId)
    .maybeSingle()

  const isLegitimateLink =
    tender?.source_email_id === emailId ||
    quoteSource != null

  if (isLegitimateLink) return false

  if (email.is_ao || email.ao_score >= 30) {
    await db.from('emails').update({ tender_id: null }).eq('id', emailId)
    return true
  }

  return false
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

/** Choisit l'AO consulté qui correspond le mieux au sujet — sinon pas de lien automatique. */
export async function resolveTenderForSupplierReply(
  db: SupabaseClient,
  userId: string,
  supplierId: string,
  subject: string,
  tenderIdHint?: string | null,
): Promise<string | null> {
  if (tenderIdHint) {
    const { data: cs } = await db
      .from('consultation_suppliers')
      .select('tender_id')
      .eq('tender_id', tenderIdHint)
      .eq('supplier_id', supplierId)
      .maybeSingle()
    if (cs) return tenderIdHint
  }

  const { data: consultations } = await db
    .from('consultation_suppliers')
    .select('tender_id, tender:tenders(id, title, client)')
    .eq('supplier_id', supplierId)
    .in('status', ['envoye', 'relance', 'relance_2', 'repondu'])

  if (!consultations?.length) return null
  if (consultations.length === 1) return consultations[0].tender_id

  const subj = subject.toLowerCase()
  let bestId: string | null = null
  let bestScore = 0

  for (const c of consultations) {
    const tender = c.tender as { id: string; title?: string; client?: string } | null
    if (!tender?.id) continue
    let score = 0
    const title = tender.title ?? ''
    const client = tender.client ?? ''
    if (title.length > 4 && subj.includes(title.toLowerCase().slice(0, 24))) score += 60
    if (client.length > 2 && subj.includes(client.toLowerCase())) score += 40
    score += tokenOverlap(title, subject) * 8
    score += tokenOverlap(client, subject) * 6
    if (score > bestScore) {
      bestScore = score
      bestId = tender.id
    }
  }

  if (bestScore >= 25) return bestId
  return null
}

/** Délie les demandes AO rattachées par erreur à un autre AO. */
export async function reconcileMislinkedAoEmails(
  db: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data: emails } = await db
    .from('emails')
    .select('id')
    .eq('user_id', userId)
    .eq('is_ao', true)
    .not('tender_id', 'is', null)
    .limit(300)

  let cleared = 0
  for (const em of emails ?? []) {
    if (await clearWrongTenderLinkForAoEmail(db, userId, em.id)) cleared++
  }
  return cleared
}
