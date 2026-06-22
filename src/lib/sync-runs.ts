import type { SupabaseClient } from '@supabase/supabase-js'

export type SyncRunStatus = 'success' | 'partial' | 'error'

export type SyncAccountError = {
  user_id: string
  email: string | null
  error: string
  stored?: number
}

export type SyncRunErrorDetail = {
  accounts?: SyncAccountError[]
  fatal?: string
  skipped?: boolean
  reason?: string
  sync_result?: Record<string, unknown>
  sync_progress?: {
    synced_count: number
    mailbox_total: number
    initial_sync_complete: boolean
    phase?: 'inbox' | 'sent' | 'incremental'
    sent_synced_count?: number
    sent_mailbox_total?: number
  }
}

export type SyncRunRow = {
  id: string
  user_id: string | null
  started_at: string
  finished_at: string | null
  status: SyncRunStatus
  accounts_synced: number
  new_emails: number
  error_detail: SyncRunErrorDetail | null
  duration_ms: number | null
}

/** maxDuration Vercel Pro du cron sync-mail (secondes) — aligné avec route.ts maxDuration = 300. */
export const CRON_SYNC_MAX_DURATION_SECONDS = 300

/** Verrou anti-chevauchement : doit couvrir CRON_SYNC_MAX_DURATION_SECONDS + marge. */
export const SYNC_LOCK_MINUTES = Math.max(10, Math.ceil(CRON_SYNC_MAX_DURATION_SECONDS / 60) + 1)

const ADMIN_ALERT_EMAIL = 'contact@nikodex.fr'

export async function isSyncRunInProgress(
  db: SupabaseClient,
  lockMinutes = SYNC_LOCK_MINUTES,
  options?: { userId?: string | null },
): Promise<boolean> {
  const threshold = new Date(Date.now() - lockMinutes * 60 * 1000).toISOString()
  let query = db
    .from('sync_runs')
    .select('id', { count: 'exact', head: true })
    .is('finished_at', null)
    .gte('started_at', threshold)

  if (options?.userId) {
    query = query.eq('user_id', options.userId)
  } else {
    query = query.is('user_id', null)
  }

  const { count } = await query
  return (count ?? 0) > 0
}

export async function startSyncRun(
  db: SupabaseClient,
  options?: { userId?: string },
): Promise<string | null> {
  const { data, error } = await db
    .from('sync_runs')
    .insert({
      started_at: new Date().toISOString(),
      status: 'success',
      accounts_synced: 0,
      new_emails: 0,
      user_id: options?.userId ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[sync_runs] insert:', error.message)
    return null
  }
  return data.id
}

export async function updateSyncRunProgress(
  db: SupabaseClient,
  runId: string,
  payload: {
    new_emails: number
    accounts_synced: number
    sync_progress: SyncRunErrorDetail['sync_progress']
    partial_result?: Record<string, unknown>
  },
): Promise<void> {
  const { data: existing } = await db
    .from('sync_runs')
    .select('error_detail')
    .eq('id', runId)
    .maybeSingle()

  const prev = (existing?.error_detail as SyncRunErrorDetail | null) ?? {}
  await db
    .from('sync_runs')
    .update({
      new_emails: payload.new_emails,
      accounts_synced: payload.accounts_synced,
      error_detail: {
        ...prev,
        sync_progress: payload.sync_progress,
        ...(payload.partial_result ? { sync_result: payload.partial_result } : {}),
      },
    })
    .eq('id', runId)
}

export async function finishSyncRun(
  db: SupabaseClient,
  runId: string,
  payload: {
    status: SyncRunStatus
    accounts_synced: number
    new_emails: number
    error_detail?: SyncRunErrorDetail | null
    startedAt: number
  },
): Promise<void> {
  const finishedAt = new Date()
  await db
    .from('sync_runs')
    .update({
      finished_at: finishedAt.toISOString(),
      status: payload.status,
      accounts_synced: payload.accounts_synced,
      new_emails: payload.new_emails,
      error_detail: payload.error_detail ?? null,
      duration_ms: finishedAt.getTime() - payload.startedAt,
    })
    .eq('id', runId)
}

export async function getRecentSyncRuns(
  db: SupabaseClient,
  limit = 20,
): Promise<SyncRunRow[]> {
  const { data } = await db
    .from('sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as SyncRunRow[]
}

export async function getSyncRunById(
  db: SupabaseClient,
  runId: string,
): Promise<SyncRunRow | null> {
  const { data } = await db.from('sync_runs').select('*').eq('id', runId).maybeSingle()
  return (data as SyncRunRow | null) ?? null
}

export async function getActiveUserSyncRun(
  db: SupabaseClient,
  userId: string,
  lockMinutes = SYNC_LOCK_MINUTES,
): Promise<SyncRunRow | null> {
  const threshold = new Date(Date.now() - lockMinutes * 60 * 1000).toISOString()
  const { data } = await db
    .from('sync_runs')
    .select('*')
    .eq('user_id', userId)
    .is('finished_at', null)
    .gte('started_at', threshold)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as SyncRunRow | null) ?? null
}

export async function getSyncHealthSummary(db: SupabaseClient) {
  const runs = await getRecentSyncRuns(db, 30)
  const cronRuns = runs.filter(r => !r.user_id)
  const completed = cronRuns.filter(r => r.finished_at)
  const lastRun = completed[0] ?? null
  const lastSuccess = completed.find(r => r.status === 'success' || r.status === 'partial') ?? null
  const errorRuns = completed.filter(r => r.status === 'error').slice(0, 10)

  const minutesSinceSuccess = lastSuccess?.finished_at
    ? Math.floor((Date.now() - new Date(lastSuccess.finished_at).getTime()) / 60000)
    : null

  const inProgress = await isSyncRunInProgress(db)

  return {
    last_run: lastRun,
    last_success: lastSuccess,
    minutes_since_success: minutesSinceSuccess,
    recent_errors: errorRuns,
    in_progress: inProgress,
  }
}

async function hasThreeConsecutiveErrors(db: SupabaseClient): Promise<boolean> {
  const { data } = await db
    .from('sync_runs')
    .select('status')
    .not('finished_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(3)

  if (!data || data.length < 3) return false
  return data.every(r => r.status === 'error')
}

export async function maybeAlertSyncFailure(
  db: SupabaseClient,
  status: SyncRunStatus,
  errorDetail: SyncRunErrorDetail | null,
  runId: string,
): Promise<void> {
  if (status !== 'error') return

  const threeStreak = await hasThreeConsecutiveErrors(db)
  const subject = threeStreak
    ? 'Operis — 3 échecs consécutifs sync mail'
    : 'Operis — échec sync mail (cron)'

  const accountErrors = errorDetail?.accounts ?? []
  const lines = accountErrors.map(
    a => `• ${a.email ?? a.user_id}: ${a.error}${a.stored ? ` (${a.stored} mails)` : ''}`,
  )
  const bodyHtml = `
    <div style="font-family:DM Sans,sans-serif;color:#021246">
      <h2 style="color:#021246">Sync mail cloud — ${threeStreak ? 'alerte série' : 'erreur'}</h2>
      <p>Run <code>${runId}</code> terminé en <strong>error</strong>.</p>
      ${errorDetail?.fatal ? `<p><strong>Fatal:</strong> ${errorDetail.fatal}</p>` : ''}
      ${lines.length ? `<ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
      <p style="font-size:12px;color:#64748b">Vercel cron /api/cron/sync-mail</p>
    </div>
  `

  try {
    const { sendHtmlEmail } = await import('@/lib/mailer')
    await sendHtmlEmail({
      to: ADMIN_ALERT_EMAIL,
      subject,
      html: bodyHtml,
    })
  } catch (err) {
    console.error('[sync_runs] alert email failed:', err)
  }
}
