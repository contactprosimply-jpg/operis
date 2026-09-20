export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { markEmailHandledQuietly } from '@/lib/priorities'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const { quote_id, winner_supplier_id, supplier_ids_to_notify } = await req.json()

  const db = createAdminClient()
  let resolvedQuoteId = quote_id

  if (!resolvedQuoteId && winner_supplier_id) {
    const { data: q } = await db
      .from('quotes')
      .select('id')
      .eq('tender_id', id)
      .eq('supplier_id', winner_supplier_id)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    resolvedQuoteId = q?.id
  }

  if (!resolvedQuoteId) return Response.json({ success: false, error: 'quote_id requis' }, { status: 400 })

  const { data: quote, error } = await db
    .from('quotes')
    .update({ is_selected: true, validated_at: new Date().toISOString(), validated_by: userId })
    .eq('id', resolvedQuoteId)
    .select('*, supplier:suppliers(*)')
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  // Valider un devis traite le mail dont il provient (il sort de la liste « À traiter »).
  await markEmailHandledQuietly(db, userId, (quote as { source_email_id?: string | null }).source_email_id)

  // Update tender status to won
  await db.from('tenders').update({ status: 'gagne' }).eq('id', id)

  return Response.json({ success: true, data: { quote, supplier_ids_to_notify } })
}
