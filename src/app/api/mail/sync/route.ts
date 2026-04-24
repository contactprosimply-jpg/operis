import { NextRequest } from 'next/server'
import { syncMailbox } from '@/services/mailSync.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  try {
    const body = await req.json().catch(() => ({}))
    const since = body.since ? new Date(body.since) : undefined
    const result = await syncMailbox(userId, since)
    return Response.json({ success: true, data: result })
  } catch (e: any) {
    return Response.json({ success: false, error: e.message }, { status: 500 })
  }
}