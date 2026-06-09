import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredEmailAttachment } from '@/lib/mail-attachments'
import { extractEmailAddress } from '@/lib/mail-attachments'

export function extractPriceFromText(text: string): number | null {
  if (!text) return null
  const normalized = text.replace(/\u00a0/g, ' ')
  const patterns = [
    /(?:montant|total|prix|devis|offre)[^\d]{0,20}(\d[\d\s]*(?:[.,]\d{2})?)\s*€/gi,
    /(\d[\d\s]*(?:[.,]\d{2})?)\s*€\s*(?:HT|ht)/gi,
    /€\s*(\d[\d\s]*(?:[.,]\d{2})?)/gi,
    /(\d[\d\s]{2,}(?:[.,]\d{2})?)\s*(?:EUR|euros?)/gi,
  ]

  const candidates: number[] = []
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    const re = new RegExp(pattern.source, pattern.flags)
    while ((match = re.exec(normalized)) !== null) {
      const raw = match[1].replace(/\s/g, '').replace(',', '.')
      const value = parseFloat(raw)
      if (!Number.isNaN(value) && value >= 100 && value < 100_000_000) {
        candidates.push(value)
      }
    }
  }

  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

function attachmentSummary(attachments: StoredEmailAttachment[]): string {
  if (!attachments.length) return ''
  return attachments.map(a => a.filename).join(', ')
}

export async function tryCreateQuoteFromInboundEmail(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  fromAddress: string,
  bodyText: string,
  attachments: StoredEmailAttachment[],
  tenderIdHint?: string | null
) {
  const fromEmail = extractEmailAddress(fromAddress)
  if (!fromEmail) return null

  const { data: supplier } = await db
    .from('suppliers')
    .select('id')
    .eq('user_id', userId)
    .ilike('email', fromEmail)
    .maybeSingle()

  if (!supplier) return null

  let tenderId = tenderIdHint ?? null

  if (!tenderId) {
    const { data: consultations } = await db
      .from('consultation_suppliers')
      .select('tender_id')
      .eq('supplier_id', supplier.id)
      .in('status', ['envoye', 'relance', 'relance_2', 'repondu'])
      .order('updated_at', { ascending: false })
      .limit(5)

    const tenderIds = (consultations ?? []).map(c => c.tender_id)
    if (tenderIds.length > 0) {
      const { data: tender } = await db
        .from('tenders')
        .select('id')
        .eq('user_id', userId)
        .in('id', tenderIds)
        .limit(1)
        .maybeSingle()
      tenderId = tender?.id ?? null
    }
  }

  if (!tenderId) return null

  const { data: existing } = await db
    .from('quotes')
    .select('id')
    .eq('source_email_id', emailId)
    .maybeSingle()

  if (existing) return existing

  const priceHt = extractPriceFromText(bodyText)
  const hasDevisFile = attachments.some(a =>
    /\.(pdf|xlsx?|docx?)$/i.test(a.filename) || /pdf|spreadsheet|word/i.test(a.contentType)
  )

  if (!priceHt && !hasDevisFile) return null

  const notes = [
    priceHt ? `Prix détecté automatiquement depuis l'email` : 'Devis reçu par email',
    attachmentSummary(attachments) ? `PJ: ${attachmentSummary(attachments)}` : '',
  ].filter(Boolean).join(' — ')

  const documentUrl = attachments.length > 0
    ? `/api/mail/emails/${emailId}/attachments/0`
    : null

  const { data: quote, error } = await db
    .from('quotes')
    .insert({
      tender_id: tenderId,
      supplier_id: supplier.id,
      price_ht: priceHt,
      document_url: documentUrl,
      notes,
      source_email_id: emailId,
      received_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) return null

  await db
    .from('consultation_suppliers')
    .update({ status: 'repondu', updated_at: new Date().toISOString() })
    .eq('tender_id', tenderId)
    .eq('supplier_id', supplier.id)

  await db.from('emails').update({ tender_id: tenderId }).eq('id', emailId)

  return quote
}
