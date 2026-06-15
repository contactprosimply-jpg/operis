export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getSyncHealthSummary, getRecentSyncRuns } from '@/lib/sync-runs'

const ADMIN_EMAIL = 'contact@nikodex.fr'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

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
