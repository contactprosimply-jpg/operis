export const dynamic = 'force-dynamic'

// ============================================================
// OPERIS — app/api/suppliers/[id]/history/route.ts
// GET → devis passés + indice prix + taux de réponse d'un fournisseur
// ============================================================

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { isValidUuid, badRequest } from '@/lib/api-validation'
import { getSupplierPriceIndex, getSupplierQuoteHistory, getSupplierResponseRate } from '@/lib/supplier-stats'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  if (!isValidUuid(id)) return badRequest('ID fournisseur invalide')

  const db = createAdminClient()

  const { data: supplier } = await db
    .from('suppliers')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!supplier) return Response.json({ success: false, error: 'Fournisseur introuvable' }, { status: 404 })

  const quotes = await getSupplierQuoteHistory(db, id)
  const tenderIds = [...new Set(quotes.map(q => q.tender_id))]

  const [priceIndex, responseRate] = await Promise.all([
    getSupplierPriceIndex(db, id, tenderIds),
    getSupplierResponseRate(db, id),
  ])

  return Response.json({
    success: true,
    data: { quotes, price_index: priceIndex, response_rate: responseRate },
  })
}
