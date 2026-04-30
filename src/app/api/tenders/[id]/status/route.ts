export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()
  const { id } = await params
  const { status } = await req.json()
  if (!status) {
    return Response.json({ success: false, error: 'status requis' }, { status: 400 })
  }
  const result = await tenderService.markStatus(id, userId, status)
  return Response.json(result, { status: result.success ? 200 : 400 })
}
