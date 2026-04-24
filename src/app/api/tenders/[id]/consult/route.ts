// ============================================================
// OPERIS — app/api/tenders/[id]/consult/route.ts
// POST /api/tenders/:id/consult → envoyer consultation
// ============================================================

import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { supplier_ids } = await req.json()
  if (!supplier_ids?.length) {
    return Response.json({ success: false, error: 'supplier_ids requis' }, { status: 400 })
  }

  const result = await tenderService.sendConsultation(params.id, userId, supplier_ids)
  return Response.json(result, { status: result.success ? 200 : 400 })
}
