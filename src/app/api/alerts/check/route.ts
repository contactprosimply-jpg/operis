export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { checkAlertsForUser } from '@/lib/alerts'

// POST /api/alerts/check — vérifie les alertes pour l'utilisateur courant
export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  try {
    const created = await checkAlertsForUser(userId)
    return Response.json({ success: true, data: { notifications_created: created } })
  } catch (e: any) {
    console.error('[POST /api/alerts/check]', e?.message)
    return Response.json({ success: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
