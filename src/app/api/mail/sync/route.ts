export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { getUserEmailFromRequest, getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { formatImapError, resolveMailAccount, syncUserMailAccounts, type MailSyncResult } from '@/lib/mail-sync'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  finishSyncRun,
  getActiveUserSyncRun,
  startSyncRun,
  type SyncRunErrorDetail,
  type SyncRunStatus,
} from '@/lib/sync-runs'

/** Sync IMAP manuelle — peut être longue (backfill). */
export const maxDuration = 300

function syncRunStatus(result: MailSyncResult, fatal?: string): SyncRunStatus {
  if (fatal) return 'error'
  const failedAccount = result.accounts?.some(a => a.status === 'error')
  if (failedAccount || result.errors > 0) return 'partial'
  return 'success'
}

async function runUserMailSync(
  userId: string,
  loginEmail: string | null,
  backfill: boolean,
  quick: boolean,
  runId: string,
  startedAt: number,
) {
  const db = createAdminClient()

  try {
    const result = await syncUserMailAccounts(userId, { backfill, quick, loginEmail })
    console.log(
      `[mail/sync] user=${userId} run=${runId} fetched=${result.fetched} stored=${result.stored} errors=${result.errors}`,
    )

    const errorDetail: SyncRunErrorDetail = {
      sync_result: result as unknown as Record<string, unknown>,
      accounts: result.accounts?.filter(a => a.status === 'error').map(a => ({
        user_id: a.user_id,
        email: a.email,
        error: a.reason ?? a.status,
        stored: a.stored,
      })),
    }

    await finishSyncRun(db, runId, {
      status: syncRunStatus(result),
      accounts_synced: result.accounts?.filter(a => a.status === 'ok').length ?? (result.stored > 0 ? 1 : 0),
      new_emails: result.stored,
      error_detail: errorDetail,
      startedAt,
    })
  } catch (e) {
    const fatal = formatImapError(e)
    console.error(`[mail/sync] user=${userId} run=${runId} fatal`, fatal)
    await finishSyncRun(db, runId, {
      status: 'error',
      accounts_synced: 0,
      new_emails: 0,
      error_detail: { fatal },
      startedAt,
    })
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()
  const loginEmail = await getUserEmailFromRequest(req)

  const body = await req.json().catch(() => ({}))
  const backfill = body?.backfill === true
  const quick = body?.quick === true

  const rate = backfill ? { allowed: true, retryAfterMinutes: 0 } : checkRateLimit(userId)
  if (!rate.allowed) {
    return Response.json({
      success: false,
      error: `Limite de synchronisation atteinte. Réessayez dans ${rate.retryAfterMinutes} minute${rate.retryAfterMinutes > 1 ? 's' : ''}.`,
    }, { status: 429 })
  }

  const db = createAdminClient()

  const active = await getActiveUserSyncRun(db, userId)
  if (active) {
    return Response.json({
      success: true,
      data: { run_id: active.id, in_progress: true, already_running: true },
    })
  }

  const account = await resolveMailAccount(userId, { loginEmail })
  if (!account) {
    return Response.json({
      success: false,
      error: 'Aucun compte mail configuré. Paramètres → Messagerie : enregistrez votre email IMAP et mot de passe, puis testez la connexion.',
      data: {
        accounts: [{
          user_id: userId,
          email: null,
          display_name: null,
          status: 'skipped',
          reason: 'compte_mail_non_configure',
        }],
      },
    }, { status: 400 })
  }

  const startedAt = Date.now()
  const runId = await startSyncRun(db, { userId })
  if (!runId) {
    return Response.json({ success: false, error: 'Impossible de démarrer la synchronisation' }, { status: 500 })
  }

  const appEnv = process.env.APP_ENV || process.env.VERCEL_ENV || 'development'
  let supabaseHost = 'unknown'
  try {
    supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').host
  } catch { /* ignore */ }
  console.log(`[mail/sync] start run=${runId} APP_ENV=${appEnv} supabase=${supabaseHost} user=${userId}`)

  after(() => runUserMailSync(userId, loginEmail, backfill, quick, runId, startedAt))

  return Response.json({
    success: true,
    data: { run_id: runId, in_progress: true },
  })
}
