import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CLOUD_CRON_MAX_NEW_MESSAGES_PER_ACCOUNT,
  type MailAccountWithId,
} from '@/lib/mail-sync'
import {
  isSyncRunInProgress,
  startSyncRun,
  finishSyncRun,
  maybeAlertSyncFailure,
  type SyncAccountError,
  type SyncRunErrorDetail,
  type SyncRunStatus,
} from '@/lib/sync-runs'

export type CloudMailSyncResult = {
  skipped: boolean
  reason?: string
  run_id?: string
  status?: SyncRunStatus
  accounts_synced: number
  new_emails: number
  errors: number
}

function formatErr(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Sync incrémental cloud : tous les comptes mail_accounts actifs.
 * Réutilise syncMailAccount (backfill: false → quick/incremental).
 */
export async function runCloudMailSync(db: SupabaseClient): Promise<CloudMailSyncResult> {
  const { syncMailAccount, mapMailAccountRow } = await import('@/lib/mail-sync')

  if (await isSyncRunInProgress(db)) {
    return {
      skipped: true,
      reason: 'sync_already_running',
      accounts_synced: 0,
      new_emails: 0,
      errors: 0,
    }
  }

  const startedAt = Date.now()
  const runId = await startSyncRun(db)
  if (!runId) {
    return {
      skipped: true,
      reason: 'sync_run_insert_failed',
      accounts_synced: 0,
      new_emails: 0,
      errors: 1,
    }
  }

  const accountErrors: SyncAccountError[] = []
  let accountsSynced = 0
  let newEmails = 0
  let fatal: string | undefined

  try {
    const { data: rows, error: listErr } = await db
      .from('mail_accounts')
      .select('*')
      .eq('is_active', true)

    if (listErr) throw new Error(listErr.message)

    if (!rows?.length) {
      await finishSyncRun(db, runId, {
        status: 'success',
        accounts_synced: 0,
        new_emails: 0,
        error_detail: { reason: 'no_active_accounts' },
        startedAt,
      })
      return {
        skipped: false,
        run_id: runId,
        status: 'success',
        accounts_synced: 0,
        new_emails: 0,
        errors: 0,
      }
    }

    for (const row of rows) {
      const account = mapMailAccountRow(row)
      if (!account) {
        accountErrors.push({
          user_id: row.user_id,
          email: row.imap_user ?? null,
          error: 'compte_mail_incomplet',
        })
        continue
      }

      try {
        const result = await syncMailAccount(
          row.user_id,
          account as MailAccountWithId & { id: string },
          {
            backfill: false,
            maxNewMessages: CLOUD_CRON_MAX_NEW_MESSAGES_PER_ACCOUNT,
          },
        )
        accountsSynced++
        newEmails += result.stored
        if (result.errors > 0) {
          accountErrors.push({
            user_id: row.user_id,
            email: account.imap_user,
            error: `${result.errors} erreur(s) dossier`,
            stored: result.stored,
          })
        }
      } catch (e) {
        accountErrors.push({
          user_id: row.user_id,
          email: account.imap_user,
          error: formatErr(e),
        })
      }
    }
  } catch (e) {
    fatal = formatErr(e)
  }

  let status: SyncRunStatus = 'success'
  if (fatal) {
    status = 'error'
  } else if (accountErrors.length > 0) {
    status = accountsSynced > 0 ? 'partial' : 'error'
  }

  const error_detail: SyncRunErrorDetail | null =
    fatal || accountErrors.length
      ? { accounts: accountErrors.length ? accountErrors : undefined, fatal }
      : null

  await finishSyncRun(db, runId, {
    status,
    accounts_synced: accountsSynced,
    new_emails: newEmails,
    error_detail,
    startedAt,
  })

  if (status === 'error') {
    await maybeAlertSyncFailure(db, status, error_detail, runId)
  }

  return {
    skipped: false,
    run_id: runId,
    status,
    accounts_synced: accountsSynced,
    new_emails: newEmails,
    errors: accountErrors.length + (fatal ? 1 : 0),
  }
}
