export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()
  const { id } = await params
  const body = await req.json()
  if (body.supplier_id) {
    const result = await tenderService.relaunchSupplier(id, body.supplier_id, userId)
    return Response.json(result, { status: result.success ? 200 : 400 })
  }
  const result = await tenderService.relaunchAll(id, userId)
  return Response.json(result, { status: result.success ? 200 : 400 })
}
