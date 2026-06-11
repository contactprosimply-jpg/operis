export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { toAttachmentMeta } from '@/lib/mail-attachments'
import { enrichInboundEmailForDisplay } from '@/lib/mail-quote-extract'
import { getMailUserScope } from '@/lib/mail-access'

export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const scope = await getMailUserScope(userId)
  const db = createAdminClient()

  const { data: email, error } = await db
    .from('emails')
    .select('*')
    .eq('id', id)
    .in('user_id', scope.allowedUserIds)
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
      const result = await enrichInboundEmailForDisplay(db, email.user_id, id)
      quoteAnalysis = {
        price_ht: result.price_ht,
        tender_id: result.tenderId,
        enriched: result.enriched,
        supplier_missing: result.supplierMissing,
      }
    } catch (err) {
      console.error('[Mail email] enrich:', err)
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
