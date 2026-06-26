import { authFetch } from '@/lib/auth-client'
import { emailRowToCached, upsertCached } from '@/lib/mailCache'

const DELTA_KEY = 'operis:mailDeltaCursor'
const DELTA_PAGE_SIZE = 1000

/** Rapatrie les nouveautés serveur → IndexedDB (boucle tant qu'il reste des pages). */
export async function pullMailDelta(): Promise<number> {
  if (typeof window === 'undefined') return 0
  let total = 0
  let since = localStorage.getItem(DELTA_KEY) ?? '1970-01-01T00:00:00Z'

  for (;;) {
    const res = await authFetch(`/api/mail/delta?since=${encodeURIComponent(since)}`)
    if (!res.ok) break

    const json = await res.json() as { rows?: Record<string, unknown>[]; newCursor?: string }
    const rows = json.rows ?? []

    if (rows.length) {
      await upsertCached(rows.map(emailRowToCached))
      total += rows.length
    }

    const newCursor = json.newCursor ?? since
    if (newCursor !== since) {
      since = newCursor
      localStorage.setItem(DELTA_KEY, newCursor)
    }

    if (rows.length < DELTA_PAGE_SIZE) break
  }

  return total
}

export function resetMailDeltaCursor() {
  if (typeof window !== 'undefined') localStorage.removeItem(DELTA_KEY)
}
