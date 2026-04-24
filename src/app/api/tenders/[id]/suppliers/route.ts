// ============================================================
// OPERIS — app/api/tenders/[id]/suppliers/route.ts
// POST /api/tenders/:id/suppliers → ajouter fournisseur à un AO
// ============================================================

import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { supplier_id } = await req.json()
  if (!supplier_id) {
    return Response.json({ success: false, error: 'supplier_id requis' }, { status: 400 })
  }

  const result = await tenderService.addSupplier(params.id, supplier_id, userId)
  return Response.json(result, { status: result.success ? 201 : 400 })
}
