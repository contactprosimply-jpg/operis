// ============================================================
// OPERIS — app/api/tenders/[id]/route.ts
// GET    /api/tenders/:id → détail AO
// PATCH  /api/tenders/:id → modifier AO
// DELETE /api/tenders/:id → supprimer AO
// ============================================================

import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const result = await tenderService.getById(params.id, userId)
  return Response.json(result, { status: result.success ? 200 : 404 })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const result = await tenderService.update(params.id, userId, body)
  return Response.json(result, { status: result.success ? 200 : 400 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const result = await tenderService.delete(params.id, userId)
  return Response.json(result, { status: result.success ? 200 : 400 })
}
