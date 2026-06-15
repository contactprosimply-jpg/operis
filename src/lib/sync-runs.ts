import type { SupabaseClient } from '@supabase/supabase-js'
import { sendHtmlEmail } from '@/lib/mailer'

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
}

export type SyncRunRow = {
  id: string
  started_at: string
  finished_at: string | null
  status: SyncRunStatus
  accounts_synced: number
  new_emails: number
  error_detail: SyncRunErrorDetail | null
  duration_ms: number | null
}

/** Durée max d'un run avant qu'un nouveau cron soit bloqué. */
export const SYNC_LOCK_MINUTES = 10

const ADMIN_ALERT_EMAIL = 'contact@nikodex.fr'

export async function isSyncRunInProgress(
  db: SupabaseClient,
  lockMinutes = SYNC_LOCK_MINUTES,
): Promise<boolean> {
  const threshold = new Date(Date.now() - lockMinutes * 60 * 1000).toISOString()
  const { count } = await db
    .from('sync_runs')
    .select('id', { count: 'exact', head: true })
    .is('finished_at', null)
    .gte('started_at', threshold)

  return (count ?? 0) > 0
}

export async function startSyncRun(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db
    .from('sync_runs')
    .insert({
      started_at: new Date().toISOString(),
      status: 'success',
      accounts_synced: 0,
      new_emails: 0,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[sync_runs] insert:', error.message)
    return null
  }
  return data.id
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

export async function getSyncHealthSummary(db: SupabaseClient) {
  const runs = await getRecentSyncRuns(db, 30)
  const completed = runs.filter(r => r.finished_at)
  const lastRun = completed[0] ?? null
  const lastSuccess = completed.find(r => r.status === 'success' || r.status === 'partial') ?? null
  const errorRuns = completed.filter(r => r.status === 'error').slice(0, 10)

  const minutesSinceSuccess = lastSuccess?.finished_at
    ? Math.floor((Date.now() - new Date(lastSuccess.finished_at).getTime()) / 60000)
    : null

  return {
    last_run: lastRun,
    last_success: lastSuccess,
    minutes_since_success: minutesSinceSuccess,
    recent_errors: errorRuns,
    in_progress: runs.some(r => !r.finished_at),
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
    await sendHtmlEmail({
      to: ADMIN_ALERT_EMAIL,
      subject,
      html: bodyHtml,
    })
  } catch (err) {
    console.error('[sync_runs] alert email failed:', err)
  }
}
