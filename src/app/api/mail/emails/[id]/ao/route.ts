export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createTenderFromEmail } from '@/services/mailSync.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()
  const { id } = await params
  const result = await createTenderFromEmail(id, userId)
  if (!result) {
    return Response.json({ success: false, error: 'Email introuvable' }, { status: 404 })
  }
  return Response.json({ success: true, data: result }, { status: 201 })
}
