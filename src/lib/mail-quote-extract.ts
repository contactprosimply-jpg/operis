import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredEmailAttachment } from '@/lib/mail-attachments'
import { extractEmailAddress } from '@/lib/mail-attachments'
import { extractPriceFromAttachments } from '@/lib/document-text-extract'
import { isEmailIncompleteForEnrich, reEnrichEmailIfNeeded } from '@/lib/mail-enrich'
import { extractFinalPriceFromText, extractPriceFromText } from '@/lib/quote-price-extract'
import {
  clearWrongTenderLinkForAoEmail,
  looksLikeIncomingAoRequest,
  looksLikeSupplierQuoteReply,
  resolveTenderForSupplierReply,
} from '@/lib/email-tender-link'

export { extractFinalPriceFromText, extractPriceFromText } from '@/lib/quote-price-extract'

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

function hasDevisAttachment(attachments: StoredEmailAttachment[]): boolean {
  return attachments.some(a =>
    /\.(pdf|xlsx?|xls|docx?|csv)$/i.test(a.filename) ||
    /pdf|spreadsheet|excel|word|officedocument/i.test(a.contentType ?? ''),
  )
}

function emailDomain(email: string): string | null {
  const e = extractEmailAddress(email)
  return e?.split('@')[1]?.toLowerCase() ?? null
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

  const fromLower = fromAddress.toLowerCase()
  const exactLoose = (all ?? []).find(s => {
    const e = extractEmailAddress(s.email ?? '')
    return e && (e === fromEmail || fromLower.includes(e))
  })
  if (exactLoose) return exactLoose

  const fromDomain = emailDomain(fromEmail)
  if (!fromDomain) return null

  return (all ?? []).find(s => emailDomain(s.email ?? '') === fromDomain) ?? null
}

/** Retrouve le fournisseur même si la réponse vient d'un autre contact du même domaine. */
async function findSupplierForReply(
  db: SupabaseClient,
  userId: string,
  fromAddress: string,
  tenderIdHint?: string | null,
) {
  const direct = await findSupplierByFromEmail(db, userId, fromAddress)
  if (direct) return direct

  const fromEmail = extractEmailAddress(fromAddress)
  const fromDomain = fromEmail ? emailDomain(fromEmail) : null
  if (!fromDomain) return null

  if (tenderIdHint) {
    const { data: consultations } = await db
      .from('consultation_suppliers')
      .select('supplier_id, supplier:suppliers(id, email)')
      .eq('tender_id', tenderIdHint)

    for (const c of consultations ?? []) {
      const s = c.supplier as { id: string; email: string } | null
      if (!s?.id) continue
      const sDomain = emailDomain(s.email ?? '')
      if (sDomain === fromDomain) return { id: s.id, email: s.email }
      const se = extractEmailAddress(s.email ?? '')
      if (fromEmail && se && (fromEmail === se || fromAddress.toLowerCase().includes(se))) {
        return { id: s.id, email: s.email }
      }
    }
  }

  return null
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
    priceNote = attResult.priceNote
      ?? (attResult.sourceFile ? `Prix final — ${attResult.sourceFile}` : 'Prix final (pièce jointe)')
  } else if (!priceHt && attResult.combinedText) {
    const final = extractFinalPriceFromText(attResult.combinedText)
    priceHt = final.price
    if (priceHt) priceNote = final.note || 'Prix final (document)'
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
): Promise<{ id: string; price_ht: number | null } | null> {
  const hasDevisFile = hasDevisAttachment(attachments)
  const { priceHt, priceNote } = await resolveQuotePrice(db, bodyText, attachments)

  if (!priceHt && !hasDevisFile) return null

  const notes = [
    priceHt ? priceNote : 'Devis reçu — prix à confirmer',
    attachmentSummary(attachments) ? `PJ: ${attachmentSummary(attachments)}` : '',
  ].filter(Boolean).join(' — ')

  const pdfIdx = attachments.findIndex(a =>
    /\.pdf$/i.test(a.filename) || (a.contentType ?? '').includes('pdf'),
  )
  const devisIdx = pdfIdx >= 0
    ? pdfIdx
    : attachments.findIndex(a => /\.(pdf|xlsx?|xls|docx?)$/i.test(a.filename))
  const documentUrl = hasDevisFile && devisIdx >= 0
    ? `/api/mail/emails/${emailId}/attachments/${devisIdx}`
    : hasDevisFile
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
  extraText?: string,
) {
  const { data: emailMeta } = await db
    .from('emails')
    .select('is_ao, ao_score, subject')
    .eq('id', emailId)
    .eq('user_id', userId)
    .maybeSingle()

  const subject = emailMeta?.subject ?? bodyText.split('\n')[0] ?? ''
  const hasDevisFile = hasDevisAttachment(attachments)
  const fullText = [extraText, bodyText].filter(Boolean).join('\n')

  if (
    emailMeta &&
    looksLikeIncomingAoRequest(subject, fullText, emailMeta.is_ao, emailMeta.ao_score ?? 0)
  ) {
    return null
  }

  if (!looksLikeSupplierQuoteReply(subject, fullText, hasDevisFile)) return null

  const supplier = await findSupplierForReply(db, userId, fromAddress, null)
  if (!supplier) return null

  const tenderId = await resolveTenderForSupplierReply(
    db,
    userId,
    supplier.id,
    subject,
    null,
  )

  if (!tenderId) return null
  const quote = await upsertQuoteFromEmail(
    db, tenderId, supplier.id, emailId, fullText, attachments,
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
    const domain = emailDomain(supplier.email)
    const orFilter = [
      `tender_id.eq.${tenderId}`,
      `from_address.ilike.%${supplierEmail}%`,
      domain ? `from_address.ilike.%@${domain}%` : '',
    ].filter(Boolean).join(',')

    const { data: emails } = await db
      .from('emails')
      .select('id, from_address, subject, body_text, body_html, has_attachments, attachments, received_at')
      .eq('user_id', userId)
      .or(orFilter)
      .order('received_at', { ascending: false })
      .limit(15)

    let linkedEmailId: string | null = null

    for (const email of emails ?? []) {
      const from = extractEmailAddress(email.from_address ?? '')
      const fromRaw = (email.from_address ?? '').toLowerCase()
      const fromDom = from ? emailDomain(from) : null
      const matches =
        (from && from === supplierEmail) ||
        fromRaw.includes(supplierEmail) ||
        (domain && fromDom === domain)
      if (!matches) continue

      let textParts = [
        email.subject ?? '',
        email.body_text ?? '',
        email.body_html ? stripHtml(email.body_html) : '',
      ]
      let attachments = (email.attachments as StoredEmailAttachment[]) ?? []

      if (!hasDevisAttachment(attachments) && !extractPriceFromText(textParts.join('\n'))) continue

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
      )

      if (quote && quote.price_ht == null && attachments.length > 0) {
        enriched = await reEnrichEmailIfNeeded(db, userId, email.id, { force: true })
        if (enriched) {
          quote = await upsertQuoteFromEmail(
            db,
            tenderId,
            supplier.id,
            email.id,
            [email.subject ?? '', enriched.bodyText].filter(Boolean).join('\n'),
            enriched.attachments,
          )
        }
      }

      if (quote) {
        await db
          .from('consultation_suppliers')
          .update({ status: 'repondu', updated_at: new Date().toISOString() })
          .eq('tender_id', tenderId)
          .eq('supplier_id', supplier.id)

        if (!linkedEmailId) linkedEmailId = email.id
        updated++
        if (quote.price_ht != null) {
          linkedEmailId = email.id
          break
        }
      }
    }

    if (linkedEmailId) {
      await db.from('emails').update({ tender_id: tenderId }).eq('id', linkedEmailId)
    }
  }

  return { updated }
}

/** Analyse complète forcée — re-télécharge PJ et recalcule tous les prix. */
export async function analyzeQuotesForTender(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
): Promise<{ analyzed: number; withPrice: number; results: Array<{ supplier: string; price: number | null }> }> {
  const { data: consultations } = await db
    .from('consultation_suppliers')
    .select('supplier_id, supplier:suppliers(id, email, name)')
    .eq('tender_id', tenderId)

  if (!consultations?.length) return { analyzed: 0, withPrice: 0, results: [] }

  let analyzed = 0
  let withPrice = 0
  const results: Array<{ supplier: string; price: number | null }> = []

  for (const c of consultations) {
    const supplier = c.supplier as { id: string; email: string; name: string } | null
    if (!supplier?.email) continue

    const supplierEmail = extractEmailAddress(supplier.email) ?? supplier.email.toLowerCase()
    const domain = emailDomain(supplier.email)
    const orFilter = [
      `tender_id.eq.${tenderId}`,
      `from_address.ilike.%${supplierEmail}%`,
      domain ? `from_address.ilike.%@${domain}%` : '',
    ].filter(Boolean).join(',')

    const { data: emails } = await db
      .from('emails')
      .select('id, from_address, subject, body_text, body_html, has_attachments, attachments, received_at')
      .eq('user_id', userId)
      .or(orFilter)
      .order('received_at', { ascending: false })
      .limit(20)

    let bestQuote: { price_ht: number | null } | null = null
    let linkedEmailId: string | null = null

    for (const email of emails ?? []) {
      const from = extractEmailAddress(email.from_address ?? '')
      const fromRaw = (email.from_address ?? '').toLowerCase()
      const fromDom = from ? emailDomain(from) : null
      const matches =
        (from && from === supplierEmail) ||
        fromRaw.includes(supplierEmail) ||
        (domain && fromDom === domain)

      if (!matches) continue

      const enriched = await reEnrichEmailIfNeeded(db, userId, email.id, { force: true })
      const attachments = enriched?.attachments ?? (email.attachments as StoredEmailAttachment[]) ?? []
      const fullText = [
        email.subject ?? '',
        enriched?.bodyText ?? email.body_text ?? '',
        email.body_html ? stripHtml(email.body_html) : '',
      ].filter(Boolean).join('\n')

      if (!hasDevisAttachment(attachments) && !extractPriceFromText(fullText)) continue

      const quote = await upsertQuoteFromEmail(
        db,
        tenderId,
        supplier.id,
        email.id,
        fullText,
        attachments,
      )

      if (quote) {
        await db
          .from('consultation_suppliers')
          .update({ status: 'repondu', updated_at: new Date().toISOString() })
          .eq('tender_id', tenderId)
          .eq('supplier_id', supplier.id)

        if (!linkedEmailId) linkedEmailId = email.id
        analyzed++
        if (quote.price_ht != null) {
          bestQuote = quote
          linkedEmailId = email.id
          break
        }
      }
    }

    if (linkedEmailId) {
      await db.from('emails').update({ tender_id: tenderId }).eq('id', linkedEmailId)
    }

    results.push({
      supplier: supplier.name,
      price: bestQuote?.price_ht ?? null,
    })
    if (bestQuote?.price_ht != null) withPrice++
  }

  return { analyzed, withPrice, results }
}

/** Télécharge PJ depuis IMAP si besoin, puis crée/met à jour le devis lié à l'AO. */
export async function processInboundEmailQuotes(
  db: SupabaseClient,
  userId: string,
  emailId: string,
): Promise<{
  enriched: boolean
  quote: { price_ht: number | null } | null
  tenderId: string | null
  supplierFound: boolean
  supplierMissing: boolean
}> {
  const { data: email } = await db
    .from('emails')
    .select('id, subject, from_address, body_text, body_html, has_attachments, attachments, tender_id')
    .eq('id', emailId)
    .eq('user_id', userId)
    .single()

  if (!email) return { enriched: false, quote: null, tenderId: null, supplierFound: false, supplierMissing: false }

  await clearWrongTenderLinkForAoEmail(db, userId, emailId)

  const enriched = await reEnrichEmailIfNeeded(db, userId, emailId, { force: isEmailIncompleteForEnrich(email) })

  const { data: current } = await db
    .from('emails')
    .select('subject, from_address, body_text, body_html, has_attachments, attachments, tender_id')
    .eq('id', emailId)
    .single()

  const row = current ?? email
  const attachments = (enriched?.attachments ?? row.attachments ?? []) as StoredEmailAttachment[]
  const bodyText = [
    row.subject ?? '',
    enriched?.bodyText ?? row.body_text ?? '',
    row.body_html ? stripHtml(row.body_html) : '',
  ].filter(Boolean).join('\n')

  const { data: emailAfterClear } = await db
    .from('emails')
    .select('tender_id, is_ao, ao_score, subject')
    .eq('id', emailId)
    .single()

  const rowAfter = emailAfterClear ?? row
  const isIncomingAo = looksLikeIncomingAoRequest(
    rowAfter.subject ?? '',
    bodyText,
    rowAfter.is_ao ?? false,
    rowAfter.ao_score ?? 0,
  )

  const quote = isIncomingAo
    ? null
    : await tryCreateQuoteFromInboundEmail(
        db,
        userId,
        emailId,
        row.from_address ?? '',
        bodyText,
        attachments,
      )

  const { data: linked } = await db.from('emails').select('tender_id').eq('id', emailId).single()

  const supplier = isIncomingAo
    ? null
    : await findSupplierForReply(db, userId, row.from_address ?? '', rowAfter.tender_id)

  const tenderIdForUi = isIncomingAo ? linked?.tender_id ?? null : linked?.tender_id ?? rowAfter.tender_id ?? null

  return {
    enriched: !!enriched,
    quote: quote ? { price_ht: quote.price_ht } : null,
    tenderId: tenderIdForUi,
    supplierFound: !!supplier,
    supplierMissing: !isIncomingAo && !supplier && !!row.from_address,
  }
}
