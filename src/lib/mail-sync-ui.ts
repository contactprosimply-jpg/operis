export type MailSyncUIState =
  | { status: 'idle'; lastSyncAt: string | null }
  | { status: 'syncing'; current: number; total: number; label?: string }
  | { status: 'done'; added: number; lastSyncAt: string }
  | { status: 'error'; message: string }

export const MAIL_LAST_SYNC_KEY = 'operis:lastSyncAt'
export const SYNC_DONE_DISMISS_MS = 4000
/** Aligné sur maxDuration serveur (300s) + chaînages after() — ne pas couper avant la fin réelle. */
export const SYNC_GLOBAL_TIMEOUT_MS = 600_000
export const SYNC_POLL_INTERVAL_MS = 2000

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
