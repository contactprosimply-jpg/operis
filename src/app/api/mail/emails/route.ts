import { NextRequest } from 'next/server'
import { getEmails } from '@/services/mailSync.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { searchParams } = new URL(req.url)
  const isAo = searchParams.get('ao') === 'true' ? true
             : searchParams.get('ao') === 'false' ? false
             : undefined
  const isRead = searchParams.get('unread') === 'true' ? false : undefined

  try {
    const data = await getEmails(userId, { isAo, isRead })
    return Response.json({ success: true, data })
  } catch (e: any) {
    return Response.json({ success: false, error: e.message }, { status: 500 })
  }
}