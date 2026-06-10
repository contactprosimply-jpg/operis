import type { SupabaseClient } from '@supabase/supabase-js'
import { toAttachmentMeta } from '@/lib/mail-attachments'
import { extractEmailAddress } from '@/lib/mail-attachments'

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

function fromMatchesSupplier(fromAddress: string | null, supplierEmails: string[]) {
  if (!fromAddress) return false
  const from = extractEmailAddress(fromAddress) || fromAddress.toLowerCase()
  return supplierEmails.some(e => from.includes(e) || e.includes(from))
}

function attachmentDedupKey(emailId: string, index: number, filename: string, size?: number) {
  return `mail:${emailId}:${index}:${filename}:${size ?? 0}`
}

function sentDedupKey(filename: string, size?: number, path?: string) {
  return `sent:${filename}:${size ?? 0}:${path ?? ''}`
}

export async function collectTenderDocuments(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
  consultations: Array<{ supplier?: { email?: string; name?: string } | null }>,
  quotes: Array<{ id: string; supplier?: { name?: string } | null; source_email_id?: string | null }>,
): Promise<{ received: TenderDocumentItem[]; sent: TenderDocumentItem[] }> {
  const received: TenderDocumentItem[] = []
  const sent: TenderDocumentItem[] = []

  const supplierEmails = consultations
    .map(c => extractEmailAddress(c.supplier?.email ?? ''))
    .filter(Boolean)

  const quoteEmailIds = [...new Set(
    quotes.map(q => q.source_email_id).filter((id): id is string => !!id),
  )]

  let emailQuery = db
    .from('emails')
    .select('id, subject, from_address, received_at, has_attachments, attachments, tender_id')
    .eq('user_id', userId)
    .order('received_at', { ascending: false })
    .limit(80)

  if (quoteEmailIds.length) {
    emailQuery = emailQuery.or(`tender_id.eq.${tenderId},id.in.(${quoteEmailIds.join(',')})`)
  } else {
    emailQuery = emailQuery.eq('tender_id', tenderId)
  }

  const { data: emails } = await emailQuery

  const seenReceived = new Set<string>()

  for (const em of emails ?? []) {
    const linked = em.tender_id === tenderId
    const fromSupplier = fromMatchesSupplier(em.from_address, supplierEmails)
    const fromQuote = quoteEmailIds.includes(em.id)
    if (!linked && !fromSupplier && !fromQuote) continue

    const supplier = consultations.find(c =>
      fromMatchesSupplier(em.from_address, [extractEmailAddress(c.supplier?.email ?? '')]),
    )
    const attachments = toAttachmentMeta(em.attachments)

    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i]
      const key = attachmentDedupKey(em.id, i, att.filename, att.size)
      if (seenReceived.has(key)) continue
      seenReceived.add(key)
      received.push({
        id: `mail:${em.id}:${i}`,
        kind: 'received',
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        date: em.received_at,
        label: em.subject,
        supplier_name: supplier?.supplier?.name ?? em.from_address?.split('<')[0].trim(),
        download_type: 'mail',
        email_id: em.id,
        attachment_index: i,
      })
    }
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

  for (const log of emailLogs ?? []) {
    const attachments = toAttachmentMeta(log.attachments)
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i]
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
