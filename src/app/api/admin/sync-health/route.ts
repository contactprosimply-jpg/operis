export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'

const ADMIN_EMAIL = 'contact@nikodex.fr'

export async function GET(req: NextRequest) {
  const { getUserFromRequest, unauthorized } = await import('@/lib/auth')
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { createAdminClient } = await import('@/lib/supabase')
  const { getSyncHealthSummary, getRecentSyncRuns } = await import('@/lib/sync-runs')

  const db = createAdminClient()
  const { data: { user } } = await db.auth.admin.getUserById(userId)
  if (!user || user.email !== ADMIN_EMAIL) {
    return Response.json({ success: false, error: 'Accès réservé' }, { status: 403 })
  }

  const summary = await getSyncHealthSummary(db)
  const runs = await getRecentSyncRuns(db, 15)

  return Response.json({
    success: true,
    data: {
      ...summary,
      runs,
    },
  })
}
