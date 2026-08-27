export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()
  const { id } = await params
  const { supplier_id, action } = await req.json().catch(() => ({}))

  if (!supplier_id) {
    return Response.json({ success: false, error: 'supplier_id requis' }, { status: 400 })
  }
  if (action !== 'sent' && action !== 'relance') {
    return Response.json({ success: false, error: 'action invalide (attendu: sent | relance)' }, { status: 400 })
  }

  const result = await tenderService.markConsultationManual(id, supplier_id, userId, action)
  return Response.json(result, { status: result.success ? 200 : 400 })
}
