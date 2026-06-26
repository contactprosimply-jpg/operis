export const MAIL_UNREAD_CHANGED_EVENT = 'operis:mail-unread-changed'

const REFRESH_THROTTLE_MS = 3000
let refreshTimer: ReturnType<typeof setTimeout> | null = null

/** Met à jour le badge immédiatement quand le compte est connu (sans fetch API). */
export function emitMailUnreadChanged(count?: number) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MAIL_UNREAD_CHANGED_EVENT, { detail: { count } }))
}

/** Demande un rafraîchissement serveur du badge — max 1 event / 3 s (évite tempête sync IMAP). */
export function scheduleMailUnreadRefresh() {
  if (typeof window === 'undefined') return
  if (refreshTimer) return
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    emitMailUnreadChanged()
  }, REFRESH_THROTTLE_MS)
}

export function createThrottledRunner(minIntervalMs: number) {
  let lastRun = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: (() => void) | null = null

  const flush = () => {
    timer = null
    if (!pending) return
    const run = pending
    pending = null
    lastRun = Date.now()
    run()
  }

  const schedule = (run: () => void, immediate = false) => {
    pending = run
    const now = Date.now()
    const elapsed = now - lastRun

    if (immediate && elapsed >= minIntervalMs) {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
      lastRun = now
      run()
      return
    }

    if (timer) return
    timer = setTimeout(flush, Math.max(0, minIntervalMs - elapsed))
  }

  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = null
  }

  return { schedule, cancel }
}
