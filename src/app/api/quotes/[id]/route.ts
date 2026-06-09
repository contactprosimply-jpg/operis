export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const price_ht = body.price_ht != null ? Number(body.price_ht) : null

  if (price_ht == null || Number.isNaN(price_ht) || price_ht <= 0) {
    return Response.json({ success: false, error: 'Prix HT invalide' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: quote } = await db
    .from('quotes')
    .select('id, tender_id')
    .eq('id', id)
    .single()

  if (!quote) {
    return Response.json({ success: false, error: 'Devis introuvable' }, { status: 404 })
  }

  const { data: tender } = await db
    .from('tenders')
    .select('id')
    .eq('id', quote.tender_id)
    .eq('user_id', userId)
    .single()

  if (!tender) {
    return Response.json({ success: false, error: 'AO introuvable' }, { status: 404 })
  }

  const { data, error } = await db
    .from('quotes')
    .update({
      price_ht,
      notes: 'Prix saisi manuellement',
      received_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, supplier:suppliers(*)')
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}
