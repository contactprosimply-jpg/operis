export const dynamic = 'force-dynamic'

// ============================================================
// OPERIS — app/api/suppliers/route.ts
// GET  /api/suppliers → liste fournisseurs
// POST /api/suppliers → crée fournisseur
// ============================================================

import { NextRequest } from 'next/server'
import { supplierService } from '@/services/supplier.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { rejectUnexpectedFields, badRequest } from '@/lib/api-validation'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const result = await supplierService.getAll(userId)
  return Response.json(result, { status: result.success ? 200 : 500 })
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return badRequest('Corps JSON requis')

  const fieldErr = rejectUnexpectedFields(body as Record<string, unknown>, [
    'name', 'email', 'phone', 'specialty', 'country', 'language', 'notes',
  ])
  if (fieldErr) return badRequest(fieldErr)

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) return badRequest('Nom requis')
  if (body.name.length > 200) return badRequest('Nom trop long (max 200 caractères)')
  if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) return badRequest('Email invalide')

  const result = await supplierService.create(userId, body)
  return Response.json(result, { status: result.success ? 201 : 400 })
}

