import { authFetch } from '@/lib/auth-client'
import type { MailSyncUIState } from '@/lib/mail-sync-ui'
import {
  MAIL_SYNC_CURSOR_KEY,
  MAIL_SYNC_PROCESSED_KEY,
  MAIL_SYNC_BATCH_TIMEOUT_MS,
  writeLastSyncAt,
} from '@/lib/mail-sync-ui'

const RETRY_DELAYS_MS = [2000, 5000, 10000]

export type MailSyncBatchPayload = {
  processed: number
  stored: number
  updated: number
  nextCursor: number | null
  done: boolean
  total: number
  cumulativeProcessed: number
  phase: string
  sessionStored: number
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise
      .then(v => { clearTimeout(timer); resolve(v) })
      .catch(e => { clearTimeout(timer); reject(e) })
  })
}

export async function callSyncBatchWithRetry(
  body: { reset?: boolean },
  tries = 3,
): Promise<MailSyncBatchPayload | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await withTimeout(
        authFetch('/api/mail/sync', {
          method: 'POST',
          body: JSON.stringify(body),
          timeoutMs: MAIL_SYNC_BATCH_TIMEOUT_MS,
        }),
        MAIL_SYNC_BATCH_TIMEOUT_MS + 2000,
      )
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      return json.data as MailSyncBatchPayload
    } catch {
      if (i === tries - 1) return null
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[i] ?? 10000))
    }
  }
  return null
}

export function saveLocalSyncProgress(cumulative: number, cursor: number | null): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MAIL_SYNC_PROCESSED_KEY, String(cumulative))
    if (cursor != null) {
      localStorage.setItem(MAIL_SYNC_CURSOR_KEY, String(cursor))
    } else {
      localStorage.removeItem(MAIL_SYNC_CURSOR_KEY)
    }
  } catch { /* ignore */ }
}

export function clearLocalSyncProgress(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(MAIL_SYNC_PROCESSED_KEY)
    localStorage.removeItem(MAIL_SYNC_CURSOR_KEY)
  } catch { /* ignore */ }
}

export function loadLocalSyncProcessed(): number {
  if (typeof window === 'undefined') return 0
  try {
    return parseInt(localStorage.getItem(MAIL_SYNC_PROCESSED_KEY) ?? '0', 10) || 0
  } catch {
    return 0
  }
}

function phaseLabel(phase: string): string {
  if (phase === 'sent') return 'Envoyés'
  if (phase === 'incremental') return 'Mise à jour'
  return 'Réception'
}

export type RunResumableSyncOptions = {
  reset?: boolean
  silent?: boolean
  onProgress: (state: MailSyncUIState) => void
  onBatch?: () => void | Promise<void>
  onError: (message: string) => void
  onDone: (added: number) => void
}

/** Boucle client : un lot par requête, reprise via état serveur + localStorage. */
export async function runResumableMailSync(options: RunResumableSyncOptions): Promise<boolean> {
  const { reset = false, onProgress, onBatch, onError, onDone } = options
  let sessionStored = 0
  let batchCount = 0

  if (reset) clearLocalSyncProgress()

  const localProcessed = reset ? 0 : loadLocalSyncProcessed()
  onProgress({
    status: 'syncing',
    current: localProcessed,
    total: Math.max(localProcessed, 1),
    label: 'Synchronisation…',
  })

  while (true) {
    const batch = await callSyncBatchWithRetry({ reset: batchCount === 0 && reset })
    if (!batch) {
      onError('Synchro interrompue — Réessayer')
      return false
    }

    batchCount += 1
    sessionStored += batch.stored
    const current = batch.cumulativeProcessed
    const total = Math.max(batch.total, current, 1)
    const pct = Math.min(100, Math.round((current / total) * 100))

    saveLocalSyncProgress(current, batch.nextCursor)
    onProgress({
      status: 'syncing',
      current,
      total,
      label: `${phaseLabel(batch.phase)} · ${current.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')} (${pct}%)`,
    })

    if (batchCount % 2 === 0) {
      await onBatch?.()
    }

    if (batch.done) break
  }

  clearLocalSyncProgress()
  writeLastSyncAt(new Date().toISOString())
  onDone(sessionStored)
  return true
}
