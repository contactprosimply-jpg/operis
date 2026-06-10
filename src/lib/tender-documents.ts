import type { SupabaseClient } from '@supabase/supabase-js'
import { toAttachmentMeta, normalizeAttachments, extractEmailAddress } from '@/lib/mail-attachments'
import { isQuoteDocument } from '@/lib/document-text-extract'
import { isEmailIncompleteForEnrich, reEnrichEmailIfNeeded } from '@/lib/mail-enrich'
import { looksLikeSupplierQuoteEmail } from '@/services/aoDetector.service'
import { uploadTenderDocument, downloadDevisFile, DEVIS_BUCKET } from '@/lib/devis-storage'
import { downloadAttachmentBuffer } from '@/lib/mail-storage'

export type TenderDocumentCategory =
  | 'ao_inbound'
  | 'supplier_response'
  | 'consultation_sent'
  | 'relance_sent'
  | 'document_sent'

export interface TenderDocumentItem {
  id: string
  kind: 'received' | 'sent'
  filename: string
  contentType?: string
  size?: number
  date?: string | null
  label?: string
  supplier_name?: string
  category: TenderDocumentCategory
  display_title: string
  download_type: 'mail' | 'tender_doc'
  email_id?: string
  attachment_index?: number
  document_id?: string
}

function titleAoInbound(fromLabel: string) {
  const who = fromLabel.trim()
  return {
    category: 'ao_inbound' as const,
    display_title: who ? `Demande AO reçue · ${who}` : 'Demande AO reçue',
  }
}

function titleSupplierResponse(supplierName: string) {
  const name = supplierName.trim() || 'Fournisseur'
  return {
    category: 'supplier_response' as const,
    display_title: `Réponse fournisseur (${name})`,
  }
}

function titleSentToSupplier(supplierName: string | null | undefined, logType: string) {
  const name = (supplierName ?? '').trim() || 'fournisseur'
  const isRelance = logType === 'relance' || logType === 'relance_2'
  return {
    category: (isRelance ? 'relance_sent' : 'consultation_sent') as TenderDocumentCategory,
    display_title: isRelance ? `Relance envoyée à ${name}` : `Envoyé à ${name}`,
  }
}

function titleDocumentSent(supplierName?: string | null) {
  const name = supplierName?.trim()
  return {
    category: 'document_sent' as const,
    display_title: name ? `Document envoyé · ${name}` : 'Document envoyé',
  }
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

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i
const OUTBOUND_DOC_SOURCES = new Set(['outbound', 'consultation'])
const INBOUND_DOC_SOURCES = new Set(['ao_request', 'inbound'])

function supplierAddr(email: string): string | null {
  return extractEmailAddress(email)?.toLowerCase() ?? null
}

function supplierDomain(email: string): string | null {
  const addr = supplierAddr(email)
  return addr?.split('@')[1] ?? null
}

function fromMatchesSupplierExact(fromAddress: string | null, supplierEmail: string): boolean {
  const from = supplierAddr(fromAddress ?? '')
  const supplier = supplierAddr(supplierEmail)
  return from != null && supplier != null && from === supplier
}

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

function inboundFilenameKey(filename: string) {
  return filename.toLowerCase().trim()
}

function clientLabelFromAddress(fromAddress?: string | null) {
  return fromAddress?.split('<')[0].trim() || fromAddress || 'Client'
}

function isNonImageAttachment(filename: string, contentType?: string): boolean {
  if (IMAGE_EXT.test(filename)) return false
  if (contentType?.startsWith('image/')) return false
  return true
}

function isInboundEmailDocument(
  subject: string,
  bodySnippet: string,
  filename: string,
  isAo: boolean,
): boolean {
  if (looksLikeSupplierQuoteEmail(subject, bodySnippet)) return true
  if (isAo) return isNonImageAttachment(filename)
  if (/cctp|dpgf|dce|dossier|consultation|appel d.offres/i.test(`${subject} ${filename}`)) return true
  return isNonImageAttachment(filename)
}

function collectInboundFilenameKeys(attachments: ReturnType<typeof toAttachmentMeta>): Set<string> {
  const keys = new Set<string>()
  for (const att of attachments) {
    if (!isNonImageAttachment(att.filename, att.contentType)) continue
    keys.add(inboundFilenameKey(att.filename))
  }
  return keys
}

function isInboundTenderDocSource(
  source: string | null | undefined,
  filename: string,
  sourceInboundKeys: Set<string>,
) {
  if (INBOUND_DOC_SOURCES.has(source ?? '')) return true
  if (OUTBOUND_DOC_SOURCES.has(source ?? '')) return false
  return sourceInboundKeys.has(inboundFilenameKey(filename))
}

/** Email d'origine de l'AO. */
async function resolveSourceEmailId(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
): Promise<string | null> {
  const { data: tender } = await db
    .from('tenders')
    .select('source_email_id')
    .eq('id', tenderId)
    .eq('user_id', userId)
    .maybeSingle()

  if (tender?.source_email_id) return tender.source_email_id

  const { data: aoEmail } = await db
    .from('emails')
    .select('id')
    .eq('user_id', userId)
    .eq('tender_id', tenderId)
    .eq('is_ao', true)
    .order('received_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return aoEmail?.id ?? null
}

/** Re-télécharge corps + PJ IMAP pour les emails liés à l'AO. */
export async function enrichTenderEmailsForDocuments(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
  sourceEmailId?: string | null,
): Promise<void> {
  const ids = new Set<string>()
  if (sourceEmailId) ids.add(sourceEmailId)

  const { data: linked } = await db
    .from('emails')
    .select('id')
    .eq('user_id', userId)
    .eq('tender_id', tenderId)

  for (const row of linked ?? []) ids.add(row.id)

  for (const emailId of ids) {
    try {
      const { data: em } = await db
        .from('emails')
        .select('id, has_attachments, attachments, body_text, body_html')
        .eq('id', emailId)
        .eq('user_id', userId)
        .maybeSingle()
      if (!em) continue
      await reEnrichEmailIfNeeded(db, userId, emailId, {
        force: emailId === sourceEmailId || isEmailIncompleteForEnrich(em),
      })
    } catch (err) {
      console.error('[tender-documents] enrich', emailId, err)
    }
  }
}

/** Copie PJ email AO → tender_documents (source ao_request). */
export async function persistAoInboundDocuments(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
  sourceEmailId: string,
): Promise<void> {
  const { data: em } = await db
    .from('emails')
    .select('attachments')
    .eq('id', sourceEmailId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!em) return

  const attachments = normalizeAttachments(em.attachments)
  if (!attachments.length) return

  const { data: existing } = await db
    .from('tender_documents')
    .select('filename, size')
    .eq('tender_id', tenderId)
    .eq('user_id', userId)

  const existingFp = new Set((existing ?? []).map(d => fileFingerprint(d.filename, d.size)))

  for (const att of attachments) {
    if (!isNonImageAttachment(att.filename, att.contentType)) continue
    const fp = fileFingerprint(att.filename, att.size)
    if (existingFp.has(fp)) continue

    const buffer = await downloadAttachmentBuffer(db, att)
    if (!buffer?.length) continue

    try {
      const docId = crypto.randomUUID()
      const storagePath = await uploadTenderDocument(db, userId, tenderId, {
        filename: att.filename,
        contentType: att.contentType || 'application/octet-stream',
        buffer,
      }, docId)

      await db.from('tender_documents').insert({
        tender_id: tenderId,
        user_id: userId,
        filename: att.filename,
        content_type: att.contentType || 'application/octet-stream',
        size: buffer.length,
        storage_path: storagePath,
        bucket: DEVIS_BUCKET,
        source: 'ao_request',
      })
      existingFp.add(fp)
    } catch (err) {
      console.error('[tender-documents] persist ao_request', att.filename, err)
    }
  }
}

/** Si l'email source n'a pas les PJ, copie depuis le 1er log consultation (stockage devis). */
export async function persistInboundFromConsultationLogs(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
  sourceEmailId: string,
): Promise<void> {
  const { data: em } = await db
    .from('emails')
    .select('attachments')
    .eq('id', sourceEmailId)
    .eq('user_id', userId)
    .maybeSingle()

  const sourceAtts = normalizeAttachments(em?.attachments).filter(
    a => isNonImageAttachment(a.filename, a.contentType),
  )
  const hasSourceFiles = sourceAtts.some(a => a.path || a.data)
  if (hasSourceFiles) return

  const { data: log } = await db
    .from('email_logs')
    .select('attachments')
    .eq('tender_id', tenderId)
    .eq('type', 'consultation')
    .order('sent_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!log) return

  const { data: existing } = await db
    .from('tender_documents')
    .select('filename, size')
    .eq('tender_id', tenderId)
    .eq('user_id', userId)

  const existingFp = new Set((existing ?? []).map(d => fileFingerprint(d.filename, d.size)))

  for (const att of toAttachmentMeta(log.attachments)) {
    if (!isNonImageAttachment(att.filename, att.contentType)) continue
    if (!att.path) continue

    const fp = fileFingerprint(att.filename, att.size)
    if (existingFp.has(fp)) continue

    const buffer = await downloadDevisFile(db, att.path)
    if (!buffer?.length) continue

    try {
      const docId = crypto.randomUUID()
      const storagePath = await uploadTenderDocument(db, userId, tenderId, {
        filename: att.filename,
        contentType: att.contentType || 'application/octet-stream',
        buffer,
      }, docId)

      await db.from('tender_documents').insert({
        tender_id: tenderId,
        user_id: userId,
        filename: att.filename,
        content_type: att.contentType || 'application/octet-stream',
        size: buffer.length,
        storage_path: storagePath,
        bucket: DEVIS_BUCKET,
        source: 'ao_request',
      })
      existingFp.add(fp)
    } catch (err) {
      console.error('[tender-documents] persist from consultation log', att.filename, err)
    }
  }
}

/** Corrige les sources DB des documents existants (upload → ao_request si PJ de l'email source). */
export async function repairTenderInboundSources(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
  _sourceEmailId: string,
  inboundKeys: Set<string>,
): Promise<void> {
  const { data: docs } = await db
    .from('tender_documents')
    .select('id, filename, source')
    .eq('tender_id', tenderId)
    .eq('user_id', userId)

  for (const doc of docs ?? []) {
    if (INBOUND_DOC_SOURCES.has(doc.source ?? '')) continue
    if (OUTBOUND_DOC_SOURCES.has(doc.source ?? '')) continue
    if (!inboundKeys.has(inboundFilenameKey(doc.filename))) continue
    await db.from('tender_documents').update({ source: 'ao_request' }).eq('id', doc.id)
  }
}

function pushReceived(
  received: TenderDocumentItem[],
  seenFiles: Set<string>,
  item: TenderDocumentItem,
) {
  const fp = fileFingerprint(item.filename, item.size)
  if (seenFiles.has(fp)) return
  seenFiles.add(fp)
  received.push(item)
}

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

/** PJ de l'email source AO — Reçus. */
async function collectInboundMailDocuments(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  seenFiles: Set<string>,
  label = 'Demande AO',
): Promise<TenderDocumentItem[]> {
  const { data: em } = await db
    .from('emails')
    .select('id, subject, from_address, received_at, attachments')
    .eq('id', emailId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!em) return []

  const items: TenderDocumentItem[] = []
  const attachments = normalizeAttachments(em.attachments)
  const clientLabel = clientLabelFromAddress(em.from_address)

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i]
    if (!isNonImageAttachment(att.filename, att.contentType)) continue

    const titles = titleAoInbound(clientLabel)
    const item: TenderDocumentItem = {
      id: `mail:${em.id}:${i}`,
      kind: 'received',
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      date: em.received_at,
      label: em.subject ?? label,
      supplier_name: clientLabel,
      category: titles.category,
      display_title: titles.display_title,
      download_type: 'mail',
      email_id: em.id,
      attachment_index: i,
    }

    const fp = fileFingerprint(item.filename, item.size)
    if (seenFiles.has(fp)) continue
    seenFiles.add(fp)
    items.push(item)
  }

  return items
}

async function collectLinkedInboundMailDocuments(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
  sourceEmailId: string | null | undefined,
  seenFiles: Set<string>,
): Promise<TenderDocumentItem[]> {
  const { data: emails } = await db
    .from('emails')
    .select('id, subject, from_address, received_at, attachments, is_ao, body_text')
    .eq('user_id', userId)
    .eq('tender_id', tenderId)

  const items: TenderDocumentItem[] = []

  for (const em of emails ?? []) {
    if (em.id === sourceEmailId) continue
    const attachments = normalizeAttachments(em.attachments)
    const fromLabel = clientLabelFromAddress(em.from_address)
    const bodySnippet = (em.body_text ?? '').slice(0, 2000)

    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i]
      const include = em.is_ao
        ? isNonImageAttachment(att.filename, att.contentType)
        : isInboundEmailDocument(em.subject ?? '', bodySnippet, att.filename, false)
      if (!include) continue

      const isSupplierReply = !em.is_ao && isInboundEmailDocument(
        em.subject ?? '', bodySnippet, att.filename, false,
      ) && looksLikeSupplierQuoteEmail(em.subject ?? '', bodySnippet)
      const titles = em.is_ao
        ? titleAoInbound(fromLabel)
        : isSupplierReply
          ? titleSupplierResponse(fromLabel)
          : titleAoInbound(fromLabel)

      const item: TenderDocumentItem = {
        id: `mail:${em.id}:${i}`,
        kind: 'received',
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        date: em.received_at,
        label: em.subject,
        supplier_name: fromLabel,
        category: titles.category,
        display_title: titles.display_title,
        download_type: 'mail',
        email_id: em.id,
        attachment_index: i,
      }

      const fp = fileFingerprint(item.filename, item.size)
      if (seenFiles.has(fp)) continue
      seenFiles.add(fp)
      items.push(item)
    }
  }

  return items
}

/**
 * Agrège les documents d'un AO.
 *
 * Reçus  = email AO source, emails entrants liés, devis fournisseurs, PJ ao_request.
 * Envoyés = PJ transmises aux fournisseurs (logs consultation/relance, upload outbound).
 * Un même fichier peut figurer dans les deux colonnes (reçu du client + renvoyé au fournisseur).
 */
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
  const seenSent = new Set<string>()

  const sourceEmailId = await resolveSourceEmailId(db, userId, tenderId)
  let inboundClientLabel = 'Client'
  let sourceReceivedAt: string | null = null
  const sourceInboundKeys = new Set<string>()

  if (sourceEmailId) {
    const { data: tenderRow } = await db
      .from('tenders')
      .select('source_email_id')
      .eq('id', tenderId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!tenderRow?.source_email_id) {
      await db
        .from('tenders')
        .update({ source_email_id: sourceEmailId })
        .eq('id', tenderId)
        .eq('user_id', userId)
    }
  }

  await enrichTenderEmailsForDocuments(db, userId, tenderId, sourceEmailId)

  if (sourceEmailId) {
    await persistAoInboundDocuments(db, userId, tenderId, sourceEmailId)
    await persistInboundFromConsultationLogs(db, userId, tenderId, sourceEmailId)

    const { data: srcMeta } = await db
      .from('emails')
      .select('from_address, attachments, received_at')
      .eq('id', sourceEmailId)
      .eq('user_id', userId)
      .maybeSingle()

    if (srcMeta) {
      inboundClientLabel = clientLabelFromAddress(srcMeta.from_address)
      sourceReceivedAt = srcMeta.received_at
      sourceInboundKeys.clear()
      for (const k of collectInboundFilenameKeys(toAttachmentMeta(srcMeta.attachments))) {
        sourceInboundKeys.add(k)
      }
    }

    await repairTenderInboundSources(db, userId, tenderId, sourceEmailId, sourceInboundKeys)

    received.push(...await collectInboundMailDocuments(db, userId, sourceEmailId, seenFiles))
  }

  received.push(...await collectLinkedInboundMailDocuments(db, userId, tenderId, sourceEmailId, seenFiles))

  const quoteBySupplier = new Map(quotes.map(q => [q.supplier_id ?? q.supplier?.id, q]))

  for (const c of consultations) {
    const supplierEmail = c.supplier?.email ?? ''
    if (!supplierEmail) continue

    const quote = quoteBySupplier.get(c.supplier_id)
    const email = await findQuoteEmailForSupplier(db, userId, supplierEmail, quote?.source_email_id)
    if (!email) continue

    const att = pickBestQuoteAttachment(email)
    if (!att) continue

    const attachments = normalizeAttachments(email.attachments)
    const origIndex = attachments.findIndex(a => a.filename === att.filename && a.size === att.size)

    const supplierName = c.supplier?.name ?? clientLabelFromAddress(email.from_address)
    const titles = titleSupplierResponse(supplierName ?? 'Fournisseur')
    pushReceived(received, seenFiles, {
      id: `mail:${email.id}:${origIndex >= 0 ? origIndex : 0}`,
      kind: 'received',
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      date: email.received_at,
      label: email.subject,
      supplier_name: supplierName,
      category: titles.category,
      display_title: titles.display_title,
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

  for (const doc of tenderDocs ?? []) {
    const fp = fileFingerprint(doc.filename, doc.size)
    const inbound = isInboundTenderDocSource(doc.source, doc.filename, sourceInboundKeys)

    const supplierName = (doc.supplier as { name?: string } | null)?.name
    const inboundTitles = titleAoInbound(inboundClientLabel)
    const outboundTitles = doc.source === 'consultation'
      ? titleSentToSupplier(supplierName, 'consultation')
      : titleDocumentSent(supplierName)

    const item: TenderDocumentItem = {
      id: doc.id,
      kind: inbound ? 'received' : 'sent',
      filename: doc.filename,
      contentType: doc.content_type,
      size: doc.size,
      date: doc.created_at,
      label: inbound ? 'Demande AO' : 'Document envoyé',
      supplier_name: inbound ? inboundClientLabel : supplierName,
      category: inbound ? inboundTitles.category : outboundTitles.category,
      display_title: inbound ? inboundTitles.display_title : outboundTitles.display_title,
      download_type: 'tender_doc',
      document_id: doc.id,
    }

    if (inbound) {
      pushReceived(received, seenFiles, item)
    } else {
      const key = `sent:doc:${doc.id}`
      if (!seenSent.has(key)) {
        seenSent.add(key)
        sent.push(item)
      }
    }
  }

  const { data: emailLogs } = await db
    .from('email_logs')
    .select('id, type, subject, sent_at, attachments, supplier:suppliers(name)')
    .eq('tender_id', tenderId)
    .order('sent_at', { ascending: false })

  for (const log of emailLogs ?? []) {
    const attachments = toAttachmentMeta(log.attachments)
    const supplierName = (log.supplier as { name?: string } | null)?.name
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i]
      if (!isNonImageAttachment(att.filename, att.contentType)) continue

      const key = `sent:log:${log.id}:${i}`
      if (seenSent.has(key)) continue
      seenSent.add(key)

      const titles = titleSentToSupplier(supplierName, log.type ?? 'consultation')
      sent.push({
        id: `log:${log.id}:${i}`,
        kind: 'sent',
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        date: log.sent_at,
        label: log.subject ?? log.type,
        supplier_name: supplierName,
        category: titles.category,
        display_title: titles.display_title,
        download_type: 'tender_doc',
        document_id: `log:${log.id}:${i}`,
      })
    }
  }

  return { received, sent }
}
