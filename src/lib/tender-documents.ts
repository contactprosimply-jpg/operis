import type { SupabaseClient } from '@supabase/supabase-js'
import { toAttachmentMeta, extractEmailAddress } from '@/lib/mail-attachments'
import { isQuoteDocument } from '@/lib/document-text-extract'

export interface TenderDocumentItem {
  id: string
  kind: 'received' | 'sent'
  filename: string
  contentType?: string
  size?: number
  date?: string | null
  label?: string
  supplier_name?: string
  download_type: 'mail' | 'tender_doc'
  email_id?: string
  attachment_index?: number
  document_id?: string
}

type ConsultationRow = {
  supplier_id: string
  status?: string
  supplier?: { id?: string; email?: string; name?: string } | null
}

type QuoteRow = {
  id: string
  supplier_id?: string
  supplier?: { id?: string; name?: string } | null
  source_email_id?: string | null
}

function supplierAddr(email: string): string | null {
  return extractEmailAddress(email)?.toLowerCase() ?? null
}

function supplierDomain(email: string): string | null {
  const addr = supplierAddr(email)
  return addr?.split('@')[1] ?? null
}

/** Correspondance stricte (même adresse) — pas de domaine seul. */
function fromMatchesSupplierExact(fromAddress: string | null, supplierEmail: string): boolean {
  const from = supplierAddr(fromAddress ?? '')
  const supplier = supplierAddr(supplierEmail)
  return from != null && supplier != null && from === supplier
}

/** Domaine identique + pièce jointe type devis (réponse d'un autre contact du fournisseur). */
function fromMatchesSupplierDomainWithDevis(
  fromAddress: string | null,
  supplierEmail: string,
  attachments: { filename: string; contentType?: string }[],
): boolean {
  const fromDom = supplierAddr(fromAddress ?? '')?.split('@')[1]
  const dom = supplierDomain(supplierEmail)
  if (!fromDom || !dom || fromDom !== dom) return false
  return attachments.some(a => isQuoteDocument(a.filename, a.contentType))
}

function fileFingerprint(filename: string, size?: number) {
  return `${filename.toLowerCase()}:${size ?? 0}`
}

/** Filtre les PDF comptabilité / factures qui ne sont pas des devis AO. */
function isLikelySupplierQuote(subject: string, filename: string): boolean {
  const blob = `${subject} ${filename}`.toLowerCase()
  if (/devis|ponuda|offre|quote|proposition|tender|pro\s+logements/i.test(blob)) return true
  if (/chorus|facture|situation|depot|avancement|liste de travail|cardinet|semip/i.test(blob)) return false
  return /\.(pdf|xlsx?|xls|docx?)$/i.test(filename)
}

type EmailCandidate = {
  id: string
  subject?: string | null
  from_address?: string | null
  received_at?: string | null
  attachments: ReturnType<typeof toAttachmentMeta>
}

function pickBestQuoteAttachment(email: EmailCandidate) {
  const quoteAtts = email.attachments
    .filter(a => isQuoteDocument(a.filename, a.contentType))
    .filter(a => isLikelySupplierQuote(email.subject ?? '', a.filename))
    .sort((a, b) => {
      const aPdf = /\.pdf$/i.test(a.filename) ? 0 : 1
      const bPdf = /\.pdf$/i.test(b.filename) ? 0 : 1
      return aPdf - bPdf
    })
  return quoteAtts[0] ?? null
}

async function findQuoteEmailForSupplier(
  db: SupabaseClient,
  userId: string,
  supplierEmail: string,
  preferredEmailId?: string | null,
): Promise<EmailCandidate | null> {
  if (preferredEmailId) {
    const { data: preferred } = await db
      .from('emails')
      .select('id, subject, from_address, received_at, attachments')
      .eq('user_id', userId)
      .eq('id', preferredEmailId)
      .maybeSingle()
    if (preferred) {
      const attachments = toAttachmentMeta(preferred.attachments)
      if (pickBestQuoteAttachment({ ...preferred, attachments })) {
        return { ...preferred, attachments }
      }
    }
  }

  const addr = supplierAddr(supplierEmail)
  if (!addr) return null

  const { data: emails } = await db
    .from('emails')
    .select('id, subject, from_address, received_at, attachments')
    .eq('user_id', userId)
    .ilike('from_address', `%${addr}%`)
    .order('received_at', { ascending: false })
    .limit(20)

  for (const em of emails ?? []) {
    const attachments = toAttachmentMeta(em.attachments)
    if (!fromMatchesSupplierExact(em.from_address, supplierEmail)) continue
    if (pickBestQuoteAttachment({ ...em, attachments })) return { ...em, attachments }
  }

  const domain = supplierDomain(supplierEmail)
  if (domain) {
    const { data: domainEmails } = await db
      .from('emails')
      .select('id, subject, from_address, received_at, attachments')
      .eq('user_id', userId)
      .ilike('from_address', `%@${domain}%`)
      .order('received_at', { ascending: false })
      .limit(30)

    for (const em of domainEmails ?? []) {
      const attachments = toAttachmentMeta(em.attachments)
      if (!fromMatchesSupplierDomainWithDevis(em.from_address, supplierEmail, attachments)) continue
      if (pickBestQuoteAttachment({ ...em, attachments })) return { ...em, attachments }
    }
  }

  return null
}

export async function collectTenderDocuments(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
  consultations: ConsultationRow[],
  quotes: QuoteRow[],
): Promise<{ received: TenderDocumentItem[]; sent: TenderDocumentItem[] }> {
  const received: TenderDocumentItem[] = []
  const sent: TenderDocumentItem[] = []
  const seenFiles = new Set<string>()

  const quoteBySupplier = new Map(
    quotes.map(q => [q.supplier_id ?? q.supplier?.id, q]),
  )

  for (const c of consultations) {
    const supplierEmail = c.supplier?.email ?? ''
    if (!supplierEmail) continue

    const quote = quoteBySupplier.get(c.supplier_id)
    const email = await findQuoteEmailForSupplier(
      db,
      userId,
      supplierEmail,
      quote?.source_email_id,
    )
    if (!email) continue

    const att = pickBestQuoteAttachment(email)
    if (!att) continue

    const fp = fileFingerprint(att.filename, att.size)
    if (seenFiles.has(fp)) continue
    seenFiles.add(fp)

    const origIndex = email.attachments.findIndex(
      a => a.filename === att.filename && a.size === att.size,
    )

    received.push({
      id: `mail:${email.id}:${origIndex >= 0 ? origIndex : 0}`,
      kind: 'received',
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      date: email.received_at,
      label: email.subject,
      supplier_name: c.supplier?.name ?? email.from_address?.split('<')[0].trim(),
      download_type: 'mail',
      email_id: email.id,
      attachment_index: origIndex >= 0 ? origIndex : 0,
    })
  }

  const { data: tenderDocs } = await db
    .from('tender_documents')
    .select('id, filename, content_type, size, source, created_at, supplier:suppliers(name)')
    .eq('tender_id', tenderId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const seenSent = new Set<string>()

  for (const doc of tenderDocs ?? []) {
    if (doc.source === 'consultation') continue
    const key = sentDedupKey(doc.filename, doc.size, doc.id)
    if (seenSent.has(key)) continue
    seenSent.add(key)
    sent.push({
      id: doc.id,
      kind: 'sent',
      filename: doc.filename,
      contentType: doc.content_type,
      size: doc.size,
      date: doc.created_at,
      label: 'Document AO',
      supplier_name: (doc.supplier as { name?: string } | null)?.name,
      download_type: 'tender_doc',
      document_id: doc.id,
    })
  }

  const { data: emailLogs } = await db
    .from('email_logs')
    .select('id, type, subject, sent_at, attachments, supplier:suppliers(name)')
    .eq('tender_id', tenderId)
    .order('sent_at', { ascending: false })

  const sentFileFp = new Set<string>()

  for (const log of emailLogs ?? []) {
    const attachments = toAttachmentMeta(log.attachments)
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i]
      const fp = fileFingerprint(att.filename, att.size)
      if (sentFileFp.has(fp)) continue
      sentFileFp.add(fp)

      const key = sentDedupKey(att.filename, att.size, `log:${log.id}:${i}`)
      if (seenSent.has(key)) continue
      seenSent.add(key)

      sent.push({
        id: `log:${log.id}:${i}`,
        kind: 'sent',
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        date: log.sent_at,
        label: log.subject ?? log.type,
        supplier_name: (log.supplier as { name?: string } | null)?.name,
        download_type: 'tender_doc',
        document_id: `log:${log.id}:${i}`,
      })
    }
  }

  return { received, sent }
}

function sentDedupKey(filename: string, size?: number, path?: string) {
  return `sent:${filename}:${size ?? 0}:${path ?? ''}`
}
