export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { syncMailAccount, type MailAccountWithId } from '@/lib/mail-sync'

export const maxDuration = 60

async function syncAccount(userId: string, account: MailAccountWithId & { id: string }) {
  try {
    const result = await syncMailAccount(userId, account, { backfill: false })
    return result.stored + result.updated
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[Cron] Erreur sync ${userId}:`, msg)
    return 0
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const { data: accounts } = await db
    .from('mail_accounts')
    .select('*')
    .eq('is_active', true)

  if (!accounts?.length) {
    return Response.json({ success: true, message: 'Aucun compte actif' })
  }

  let totalStored = 0
  for (const account of accounts) {
    const stored = await syncAccount(account.user_id, account as MailAccountWithId & { id: string })
    totalStored += stored
  }

  console.log(`[Cron] Sync terminée — ${totalStored} nouveaux emails, ${accounts.length} comptes`)
  return Response.json({ success: true, data: { stored: totalStored, accounts: accounts.length } })
}
