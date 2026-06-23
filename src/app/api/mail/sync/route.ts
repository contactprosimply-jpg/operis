export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { getUserEmailFromRequest, getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { formatImapError, resolveMailAccount, syncUserMailAccountsStep, type MailSyncResult } from '@/lib/mail-sync'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  clearStaleUserSyncRun,
  finishSyncRun,
  getActiveUserSyncRun,
  getSyncRunById,
  isSyncRunInProgress,
  startSyncRun,
  updateSyncRunProgress,
  type SyncRunErrorDetail,
  type SyncRunStatus,
} from '@/lib/sync-runs'

/** Sync IMAP manuelle — peut être longue (backfill multi-lots). */
export const maxDuration = 300

const CHAIN_BUFFER_MS = 20_000

async function finishStaleRunIfNeeded(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<boolean> {
  return clearStaleUserSyncRun(db, userId)
}

function syncRunStatus(result: MailSyncResult, fatal?: string): SyncRunStatus {
  if (fatal) return 'error'
  const failedAccount = result.accounts?.some(a => a.status === 'error')
  if (failedAccount || result.errors > 0) return 'partial'
  return 'success'
}

function mergeStepIntoAggregate(
  aggregate: MailSyncResult,
  stepResult: MailSyncResult,
) {
  aggregate.fetched += stepResult.fetched
  aggregate.stored += stepResult.stored
  aggregate.updated += stepResult.updated
  aggregate.aoDetected += stepResult.aoDetected
  aggregate.duplicates += stepResult.duplicates
  aggregate.errors += stepResult.errors
  aggregate.maxUid = Math.max(aggregate.maxUid, stepResult.maxUid)
  aggregate.quickStored = (aggregate.quickStored ?? 0) + (stepResult.quickStored ?? 0)
  if (stepResult.mailboxes) aggregate.mailboxes = stepResult.mailboxes
  if (stepResult.accounts) aggregate.accounts = stepResult.accounts
}

async function runUserMailSyncLoop(
  userId: string,
  loginEmail: string | null,
  runId: string,
  startedAt: number,
  chainDepth = 0,
): Promise<void> {
  const db = createAdminClient()
  const deadline = startedAt + (maxDuration * 1000) - CHAIN_BUFFER_MS

  const aggregate: MailSyncResult = {
    fetched: 0,
    stored: 0,
    updated: 0,
    aoDetected: 0,
    duplicates: 0,
    errors: 0,
    maxUid: 0,
    accounts: [],
  }

  let lastProgress = {
    synced_count: 0,
    mailbox_total: 0,
    initial_sync_complete: false,
  }

  try {
    while (Date.now() < deadline) {
      const step = await syncUserMailAccountsStep(userId, {
        loginEmail,
        onProgress: async progress => {
          await updateSyncRunProgress(db, runId, {
            new_emails: aggregate.stored,
            accounts_synced: aggregate.accounts?.filter(a => a.status === 'ok').length ?? 0,
            sync_progress: progress,
            partial_result: aggregate as unknown as Record<string, unknown>,
          })
        },
      })
      mergeStepIntoAggregate(aggregate, step.result)
      lastProgress = step.progress

      await updateSyncRunProgress(db, runId, {
        new_emails: aggregate.stored,
        accounts_synced: step.result.accounts?.filter(a => a.status === 'ok').length ?? 0,
        sync_progress: step.progress,
        partial_result: aggregate as unknown as Record<string, unknown>,
      })

      if (!step.needs_more) break
    }

    const stillNeedsMore = !lastProgress.initial_sync_complete
      && Date.now() >= deadline - CHAIN_BUFFER_MS

    if (stillNeedsMore && chainDepth < 40) {
      after(() => runUserMailSyncLoop(userId, loginEmail, runId, Date.now(), chainDepth + 1))
      return
    }

    const errorDetail: SyncRunErrorDetail = {
      sync_result: aggregate as unknown as Record<string, unknown>,
      sync_progress: lastProgress,
      accounts: aggregate.accounts?.filter(a => a.status === 'error').map(a => ({
        user_id: a.user_id,
        email: a.email,
        error: a.reason ?? a.status,
        stored: a.stored,
      })),
    }

    await finishSyncRun(db, runId, {
      status: syncRunStatus(aggregate),
      accounts_synced: aggregate.accounts?.filter(a => a.status === 'ok').length ?? (aggregate.stored > 0 ? 1 : 0),
      new_emails: aggregate.stored,
      error_detail: errorDetail,
      startedAt,
    })

    console.log(
      `[mail/sync] user=${userId} run=${runId} done stored=${aggregate.stored} progress=${lastProgress.synced_count}/${lastProgress.mailbox_total}`,
    )
  } catch (e) {
    const fatal = formatImapError(e)
    console.error(`[mail/sync] user=${userId} run=${runId} fatal`, fatal)
    await finishSyncRun(db, runId, {
      status: 'error',
      accounts_synced: 0,
      new_emails: aggregate.stored,
      error_detail: { fatal, sync_progress: lastProgress },
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

  const account = await resolveMailAccount(userId, { loginEmail })
  const needsFullBackfill = account && (
    !account.initial_sync_complete || !account.sent_initial_sync_complete
  )
  const rate = (backfill || needsFullBackfill)
    ? { allowed: true, retryAfterMinutes: 0 }
    : checkRateLimit(userId)

  if (!rate.allowed) {
    return Response.json({
      success: false,
      error: `Limite de synchronisation atteinte. Réessayez dans ${rate.retryAfterMinutes} minute${rate.retryAfterMinutes > 1 ? 's' : ''}.`,
    }, { status: 429 })
  }

  const db = createAdminClient()

  const active = await getActiveUserSyncRun(db, userId)
  if (active) {
    const cleared = await finishStaleRunIfNeeded(db, userId)
    if (!cleared) {
      return Response.json({
        success: true,
        data: { run_id: active.id, in_progress: true, already_running: true },
      })
    }
  }

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

  console.log(`[mail/sync] start run=${runId} user=${userId} backfill=${needsFullBackfill} quick=${quick}`)

  after(() => runUserMailSyncLoop(userId, loginEmail, runId, startedAt))

  return Response.json({
    success: true,
    data: {
      run_id: runId,
      in_progress: true,
      initial_backfill: needsFullBackfill,
    },
  })
}
