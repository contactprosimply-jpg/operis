export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { createAdminClient } = await import('@/lib/supabase')
  const { runCloudMailSync } = await import('@/lib/sync-mail-cron')

  const db = createAdminClient()
  const result = await runCloudMailSync(db)

  if (result.skipped) {
    return Response.json({
      success: true,
      skipped: true,
      reason: result.reason,
    })
  }

  console.log(
    `[Cron/sync-mail] status=${result.status} accounts=${result.accounts_synced} new=${result.new_emails} errors=${result.errors}`,
  )

  return Response.json({
    success: result.status !== 'error',
    data: result,
  })
}
