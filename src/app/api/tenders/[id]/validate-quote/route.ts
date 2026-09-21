export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { markEmailHandledQuietly } from '@/lib/priorities'
import { badRequest, isValidUuid } from '@/lib/api-validation'
import { assertTenderAccess } from '@/lib/tender-access'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  if (!isValidUuid(id)) return badRequest('id UUID invalide')

  const { quote_id, winner_supplier_id, supplier_ids_to_notify } = await req.json().catch(() => ({}))
  if (quote_id != null && !isValidUuid(quote_id)) return badRequest('quote_id UUID invalide')
  if (winner_supplier_id != null && !isValidUuid(winner_supplier_id)) return badRequest('winner_supplier_id UUID invalide')

  const db = createAdminClient()

  // L'AO doit appartenir à l'appelant (ou à son organisation) — sans ça, n'importe quel
  // utilisateur authentifié pouvait valider un devis et passer en « gagné » l'AO d'un autre
  // en devinant les UUID (l'écriture passe par le client admin, qui contourne le RLS).
  const access = await assertTenderAccess(db, id, userId, 'mutate')
  if (!access.ok) return Response.json({ success: false, error: access.error }, { status: access.status })

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

  // Le devis doit appartenir à CET AO : le contrôle d'accès ci-dessus porte sur l'AO de l'URL,
  // pas sur le quote_id du corps (sinon on passerait son propre AO avec le devis d'un autre).
  const { data: quote, error } = await db
    .from('quotes')
    .update({ is_selected: true, validated_at: new Date().toISOString(), validated_by: userId })
    .eq('id', resolvedQuoteId)
    .eq('tender_id', id)
    .select('*, supplier:suppliers(*)')
    .maybeSingle()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  if (!quote) return Response.json({ success: false, error: 'Devis introuvable' }, { status: 404 })

  // Valider un devis traite le mail dont il provient (il sort de la liste « À traiter »).
  await markEmailHandledQuietly(db, userId, (quote as { source_email_id?: string | null }).source_email_id)

  // Update tender status to won
  await db.from('tenders').update({ status: 'gagne' }).eq('id', id)

  return Response.json({ success: true, data: { quote, supplier_ids_to_notify } })
}
