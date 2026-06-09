import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredEmailAttachment } from '@/lib/mail-attachments'
import { extractEmailAddress } from '@/lib/mail-attachments'
import { extractPriceFromAttachments } from '@/lib/document-text-extract'
import { reEnrichEmailIfNeeded } from '@/lib/mail-enrich'
import { extractPriceFromText } from '@/lib/quote-price-extract'

export { extractPriceFromText } from '@/lib/quote-price-extract'

function stripHtml(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function attachmentSummary(attachments: StoredEmailAttachment[]): string {
  if (!attachments.length) return ''
  return attachments.map(a => a.filename).join(', ')
}

function hasDevisAttachment(attachments: StoredEmailAttachment[], hasAttachmentsFlag?: boolean): boolean {
  if (hasAttachmentsFlag) return true
  return attachments.some(a =>
    /\.(pdf|xlsx?|xls|docx?|csv)$/i.test(a.filename) ||
    /pdf|spreadsheet|excel|word|octet-stream/i.test(a.contentType ?? ''),
  )
}

async function findSupplierByFromEmail(db: SupabaseClient, userId: string, fromAddress: string) {
  const fromEmail = extractEmailAddress(fromAddress)
  if (!fromEmail) return null

  const { data: exact } = await db
    .from('suppliers')
    .select('id, email')
    .eq('user_id', userId)
    .ilike('email', fromEmail)
    .maybeSingle()
  if (exact) return exact

  const { data: all } = await db
    .from('suppliers')
    .select('id, email')
    .eq('user_id', userId)

  return (all ?? []).find(s => {
    const e = extractEmailAddress(s.email ?? '')
    return e && (e === fromEmail || fromAddress.toLowerCase().includes(e))
  }) ?? null
}

async function resolveQuotePrice(
  db: SupabaseClient,
  bodyText: string,
  attachments: StoredEmailAttachment[],
): Promise<{ priceHt: number | null; priceNote: string }> {
  const bodyPrice = extractPriceFromText(bodyText)
  const attResult = await extractPriceFromAttachments(db, attachments)

  let priceHt = bodyPrice
  let priceNote = bodyPrice ? 'Prix détecté dans le texte de l\'email' : ''

  if (attResult.price != null) {
    priceHt = attResult.price
    priceNote = attResult.sourceFile
      ? `Prix extrait de ${attResult.sourceFile}`
      : 'Prix extrait des pièces jointes'
  } else if (!priceHt && attResult.combinedText) {
    priceHt = extractPriceFromText(attResult.combinedText, true)
    if (priceHt) priceNote = 'Prix extrait du document (PDF/Excel/Word)'
  }

  return { priceHt, priceNote }
}

export async function upsertQuoteFromEmail(
  db: SupabaseClient,
  tenderId: string,
  supplierId: string,
  emailId: string,
  bodyText: string,
  attachments: StoredEmailAttachment[],
  hasAttachmentsFlag?: boolean,
): Promise<{ id: string; price_ht: number | null } | null> {
  const hasDevisFile = hasDevisAttachment(attachments, hasAttachmentsFlag)
  const { priceHt, priceNote } = await resolveQuotePrice(db, bodyText, attachments)

  if (!priceHt && !hasDevisFile) return null

  const notes = [
    priceHt ? priceNote : 'Devis reçu — prix à confirmer',
    attachmentSummary(attachments) ? `PJ: ${attachmentSummary(attachments)}` : '',
  ].filter(Boolean).join(' — ')

  const documentUrl = hasDevisFile
    ? `/api/mail/emails/${emailId}/attachments/0`
    : null

  const { data: existing } = await db
    .from('quotes')
    .select('id, price_ht, source_email_id')
    .eq('tender_id', tenderId)
    .eq('supplier_id', supplierId)
    .maybeSingle()

  if (existing) {
    const updates: Record<string, unknown> = {
      source_email_id: emailId,
      received_at: new Date().toISOString(),
      notes,
    }
    if (priceHt != null) updates.price_ht = priceHt
    if (documentUrl) updates.document_url = documentUrl

    await db.from('quotes').update(updates).eq('id', existing.id)
    return { id: existing.id, price_ht: priceHt ?? existing.price_ht }
  }

  const { data: quote, error } = await db
    .from('quotes')
    .insert({
      tender_id: tenderId,
      supplier_id: supplierId,
      price_ht: priceHt,
      document_url: documentUrl,
      notes,
      source_email_id: emailId,
      received_at: new Date().toISOString(),
    })
    .select('id, price_ht')
    .single()

  if (error || !quote) return null
  return quote
}

export async function tryCreateQuoteFromInboundEmail(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  fromAddress: string,
  bodyText: string,
  attachments: StoredEmailAttachment[],
  tenderIdHint?: string | null,
  extraText?: string,
  hasAttachmentsFlag?: boolean,
) {
  const supplier = await findSupplierByFromEmail(db, userId, fromAddress)
  if (!supplier) return null

  let tenderId = tenderIdHint ?? null

  if (!tenderId) {
    const { data: consultations } = await db
      .from('consultation_suppliers')
      .select('tender_id')
      .eq('supplier_id', supplier.id)
      .in('status', ['envoye', 'relance', 'relance_2', 'repondu'])
      .order('updated_at', { ascending: false })
      .limit(10)

    const tenderIds = (consultations ?? []).map(c => c.tender_id)
    if (tenderIds.length > 0) {
      const { data: tender } = await db
        .from('tenders')
        .select('id')
        .eq('user_id', userId)
        .in('id', tenderIds)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      tenderId = tender?.id ?? tenderIds[0]
    }
  }

  if (!tenderId) return null

  const fullText = [extraText, bodyText].filter(Boolean).join('\n')
  const quote = await upsertQuoteFromEmail(
    db, tenderId, supplier.id, emailId, fullText, attachments, hasAttachmentsFlag,
  )
  if (!quote) return null

  await db
    .from('consultation_suppliers')
    .update({ status: 'repondu', updated_at: new Date().toISOString() })
    .eq('tender_id', tenderId)
    .eq('supplier_id', supplier.id)

  await db.from('emails').update({ tender_id: tenderId }).eq('id', emailId)

  return quote
}

/** Scan les emails liés à un AO et crée/met à jour les devis. */
export async function backfillQuotesForTender(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
): Promise<{ updated: number }> {
  const { data: consultations } = await db
    .from('consultation_suppliers')
    .select('supplier_id, supplier:suppliers(id, email, name)')
    .eq('tender_id', tenderId)

  if (!consultations?.length) return { updated: 0 }

  let updated = 0

  for (const c of consultations) {
    const supplier = c.supplier as { id: string; email: string; name: string } | null
    if (!supplier?.email) continue
    const supplierEmail = extractEmailAddress(supplier.email) ?? supplier.email.toLowerCase()

    const { data: emails } = await db
      .from('emails')
      .select('id, from_address, subject, body_text, body_html, has_attachments, attachments, received_at')
      .eq('user_id', userId)
      .or(`tender_id.eq.${tenderId},from_address.ilike.%${supplierEmail}%`)
      .order('received_at', { ascending: false })
      .limit(15)

    for (const email of emails ?? []) {
      const from = extractEmailAddress(email.from_address ?? '')
      const fromRaw = (email.from_address ?? '').toLowerCase()
      if (from && from !== supplierEmail && !fromRaw.includes(supplierEmail)) continue

      let textParts = [
        email.subject ?? '',
        email.body_text ?? '',
        email.body_html ? stripHtml(email.body_html) : '',
      ]
      let attachments = (email.attachments as StoredEmailAttachment[]) ?? []

      let enriched = await reEnrichEmailIfNeeded(db, userId, email.id)
      if (enriched) {
        textParts = [email.subject ?? '', enriched.bodyText]
        attachments = enriched.attachments
      }

      const fullText = textParts.filter(Boolean).join('\n')

      let quote = await upsertQuoteFromEmail(
        db,
        tenderId,
        supplier.id,
        email.id,
        fullText,
        attachments,
        email.has_attachments,
      )

      if (quote && quote.price_ht == null && (email.has_attachments || attachments.length > 0)) {
        enriched = await reEnrichEmailIfNeeded(db, userId, email.id, { force: true })
        if (enriched) {
          quote = await upsertQuoteFromEmail(
            db,
            tenderId,
            supplier.id,
            email.id,
            [email.subject ?? '', enriched.bodyText].filter(Boolean).join('\n'),
            enriched.attachments,
            true,
          )
        }
      }

      if (quote) {
        await db
          .from('consultation_suppliers')
          .update({ status: 'repondu', updated_at: new Date().toISOString() })
          .eq('tender_id', tenderId)
          .eq('supplier_id', supplier.id)

        await db.from('emails').update({ tender_id: tenderId }).eq('id', email.id)
        updated++
        if (quote.price_ht != null) break
      }
    }
  }

  return { updated }
}
