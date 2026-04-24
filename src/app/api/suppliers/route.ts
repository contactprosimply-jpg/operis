// ============================================================
// OPERIS — app/api/suppliers/route.ts
// GET  /api/suppliers → liste fournisseurs
// POST /api/suppliers → crée fournisseur
// ============================================================

import { NextRequest } from 'next/server'
import { supplierService } from '@/services/supplier.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const result = await supplierService.getAll(userId)
  return Response.json(result, { status: result.success ? 200 : 500 })
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const result = await supplierService.create(userId, body)
  return Response.json(result, { status: result.success ? 201 : 400 })
}
