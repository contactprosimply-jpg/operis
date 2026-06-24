export type MailSyncUIState =
  | { status: 'idle'; lastSyncAt: string | null }
  | { status: 'syncing'; current: number; total: number; label?: string }
  | { status: 'done'; added: number; lastSyncAt: string }
  | { status: 'error'; message: string }

export const MAIL_LAST_SYNC_KEY = 'operis:lastSyncAt'
export const MAIL_SYNC_CURSOR_KEY = 'operis:mailSyncCursor'
export const MAIL_SYNC_PROCESSED_KEY = 'operis:mailSyncProcessed'
export const SYNC_DONE_DISMISS_MS = 4000
export const MAIL_SYNC_BATCH_TIMEOUT_MS = 30_000

export function readLastSyncAt(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(MAIL_LAST_SYNC_KEY)
  } catch {
    return null
  }
}

export function writeLastSyncAt(iso: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MAIL_LAST_SYNC_KEY, iso)
  } catch {
    /* ignore */
  }
}

export function initialMailSyncUI(): MailSyncUIState {
  return { status: 'idle', lastSyncAt: readLastSyncAt() }
}

export function syncPercent(current: number, total: number): number | null {
  if (total <= 0) return null
  return Math.min(100, Math.max(0, Math.round((current / total) * 100)))
}
