export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest } from 'next/server'
import { runAutoRelaunches } from '@/lib/auto-relaunch'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runAutoRelaunches()
    console.log(
      `[Cron/Relaunch] ${result.sent} envoyée(s), ${result.errors} erreur(s), ${result.tenders} AO`,
    )
    return Response.json({ success: true, data: result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[Cron/Relaunch]', msg)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
