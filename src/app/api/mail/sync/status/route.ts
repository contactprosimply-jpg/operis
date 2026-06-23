export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  clearStaleUserSyncRun,
  getActiveUserSyncRun,
  getSyncRunById,
  isSyncRunInProgress,
} from '@/lib/sync-runs'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const runId = req.nextUrl.searchParams.get('run_id')
  const db = createAdminClient()

  if (!runId) {
    await clearStaleUserSyncRun(db, userId)
  }

  const run = runId
    ? await getSyncRunById(db, runId)
    : await getActiveUserSyncRun(db, userId)

  if (run && run.user_id && run.user_id !== userId) {
    return Response.json({ success: false, error: 'Run introuvable' }, { status: 404 })
  }

  const inProgress = run
    ? !run.finished_at
    : await isSyncRunInProgress(db, undefined, { userId })

  return Response.json({
    success: true,
    data: {
      in_progress: inProgress,
      run,
      sync_result: run?.finished_at ? run.error_detail?.sync_result ?? null : null,
      sync_progress: run?.error_detail?.sync_progress ?? null,
    },
  })
}
