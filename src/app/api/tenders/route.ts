// ============================================================
// OPERIS — app/api/tenders/route.ts
// GET  /api/tenders → liste tous les AO
// POST /api/tenders → crée un AO
// ============================================================

import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const result = await tenderService.getAll(userId)
  return Response.json(result, { status: result.success ? 200 : 500 })
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const result = await tenderService.create(userId, body)
  return Response.json(result, { status: result.success ? 201 : 400 })
}
