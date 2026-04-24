// ============================================================
// OPERIS — app/api/tenders/[id]/relaunch/route.ts
// POST /api/tenders/:id/relaunch
// Body : { supplier_id } → relance un fournisseur
// Body : {}              → relance tous les non-répondants
// ============================================================

import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()

  // Relance individuelle
  if (body.supplier_id) {
    const result = await tenderService.relaunchSupplier(params.id, body.supplier_id, userId)
    return Response.json(result, { status: result.success ? 200 : 400 })
  }

  // Relance globale (tous les non-répondants)
  const result = await tenderService.relaunchAll(params.id, userId)
  return Response.json(result, { status: result.success ? 200 : 400 })
}


// ============================================================
// OPERIS — app/api/tenders/[id]/status/route.ts
// PATCH /api/tenders/:id/status → changer statut AO
// ============================================================

// Ce fichier est séparé — crée src/app/api/tenders/[id]/status/route.ts
// avec le contenu ci-dessous :

/*
import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { status } = await req.json()
  if (!status) {
    return Response.json({ success: false, error: 'status requis' }, { status: 400 })
  }

  const result = await tenderService.markStatus(params.id, userId, status)
  return Response.json(result, { status: result.success ? 200 : 400 })
}
*/
