export const dynamic = 'force-dynamic'

// ============================================================
// OPERIS — app/api/tenders/route.ts
// GET  /api/tenders → liste tous les AO
// POST /api/tenders → crée un AO
// ============================================================

import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { deleteAllTendersForUser } from '@/lib/tender-reset'

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

/** Supprime tous les AO du compte (devis, consultations, documents) et délie les emails. */
export async function DELETE(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  let body: { confirm?: string } = {}
  try {
    body = await req.json()
  } catch {
    return Response.json({ success: false, error: 'Corps JSON requis' }, { status: 400 })
  }

  if (body.confirm !== 'DELETE_ALL_TENDERS') {
    return Response.json({
      success: false,
      error: 'Confirmation requise : { "confirm": "DELETE_ALL_TENDERS" }',
    }, { status: 400 })
  }

  try {
    const db = createAdminClient()
    const result = await deleteAllTendersForUser(db, userId)
    return Response.json({
      success: true,
      data: {
        deleted_tenders: result.deletedTenders,
        cleared_email_links: result.clearedEmailLinks,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur suppression'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}

