export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { toAttachmentMeta } from '@/lib/mail-attachments'
import { processInboundEmailQuotes } from '@/lib/mail-quote-extract'

export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const db = createAdminClient()

  const { data: email, error } = await db
    .from('emails')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error || !email) {
    return Response.json({ success: false, error: 'Email introuvable' }, { status: 404 })
  }

  const analyze = req.nextUrl.searchParams.get('analyze') !== 'false'
  let quoteAnalysis: {
    price_ht: number | null
    tender_id: string | null
    enriched: boolean
    supplier_missing?: boolean
  } | null = null

  if (analyze) {
    try {
      const result = await processInboundEmailQuotes(db, userId, id)
      quoteAnalysis = {
        price_ht: result.quote?.price_ht ?? null,
        tender_id: result.tenderId,
        enriched: result.enriched,
        supplier_missing: result.supplierMissing,
      }
    } catch (err) {
      console.error('[Mail email] quote analysis:', err)
    }
  }

  const { data: refreshed } = await db
    .from('emails')
    .select('*')
    .eq('id', id)
    .single()

  const row = refreshed ?? email
  const attachments = toAttachmentMeta(row.attachments)
  const hasAttachments = !!row.has_attachments || attachments.length > 0

  return Response.json({
    success: true,
    data: {
      ...row,
      has_attachments: hasAttachments,
      attachments,
      attachments_pending: hasAttachments && attachments.length === 0,
      quote_analysis: quoteAnalysis,
    },
  })
}
