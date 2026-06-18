/** Cache client stale-while-revalidate (mémoire + sessionStorage). */

const memory = new Map<string, { data: unknown; at: number }>()

function storageKey(key: string) {
  return `operis:cache:${key}`
}

export function readCache<T>(key: string, maxAgeMs = 10 * 60_000): T | null {
  const mem = memory.get(key)
  if (mem && Date.now() - mem.at < maxAgeMs) return mem.data as T

  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data: T; at: number }
    if (Date.now() - parsed.at > maxAgeMs) return null
    memory.set(key, parsed)
    return parsed.data
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, data: T) {
  const entry = { data, at: Date.now() }
  memory.set(key, entry)
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(entry))
  } catch {
    /* quota — garde mémoire uniquement */
  }
}

export function invalidateCache(key: string) {
  memory.delete(key)
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(storageKey(key))
  } catch { /* ignore */ }
}

export function cacheKeyForUser(userId: string, resource: string) {
  return `${userId}:${resource}`
}
