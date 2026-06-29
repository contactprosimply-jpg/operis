import { mailApiFetch } from '@/lib/mail-request-guard'
import { emailRowToCached, folderKeyToDeltaParams, upsertCached } from '@/lib/mailCache'

const DELTA_LIMIT = 500
const MAX_BATCHES = 5
const DEFAULT_SINCE = '1970-01-01T00:00:00.000Z'

function deltaCursorKey(folderKey: string): string {
  return `operis:mailDeltaCursor:${folderKey}`
}

function readCursor(folderKey: string): string {
  if (typeof window === 'undefined') return DEFAULT_SINCE
  try {
    return localStorage.getItem(deltaCursorKey(folderKey)) ?? DEFAULT_SINCE
  } catch {
    return DEFAULT_SINCE
  }
}

function writeCursor(folderKey: string, cursor: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(deltaCursorKey(folderKey), cursor)
  } catch { /* ignore */ }
}

/** UN appel delta groupé par lot ; max 5 lots ; cursor par dossier. */
export async function pullMailDelta(folderKey = 'inbox'): Promise<number> {
  if (typeof window === 'undefined') return 0

  let total = 0
  let since = readCursor(folderKey)
  const { folder, imapPath } = folderKeyToDeltaParams(folderKey)

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const params = new URLSearchParams({ since, folder })
    if (imapPath) params.set('imap_path', imapPath)

    let res: Response
    try {
      res = await mailApiFetch(`/api/mail/delta?${params}`)
    } catch {
      break
    }
    if (!res.ok) break

    const json = await res.json() as {
      rows?: Record<string, unknown>[]
      newCursor?: string
    }
    const rows = json.rows ?? []

    if (rows.length) {
      await upsertCached(rows.map(emailRowToCached))
      total += rows.length
    }

    const newCursor = json.newCursor ?? since
    if (newCursor !== since) {
      since = newCursor
      writeCursor(folderKey, newCursor)
    }

    if (rows.length < DELTA_LIMIT) break
  }

  return total
}

export function resetMailDeltaCursor(folderKey?: string): void {
  if (typeof window === 'undefined') return
  try {
    if (folderKey) {
      localStorage.removeItem(deltaCursorKey(folderKey))
      return
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith('operis:mailDeltaCursor:')) localStorage.removeItem(key)
    }
    localStorage.removeItem('operis:mailDeltaCursor')
  } catch { /* ignore */ }
}
