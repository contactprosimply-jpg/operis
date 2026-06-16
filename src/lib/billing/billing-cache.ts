const CACHE_KEY = 'operis_billing_access'
const NEGATIVE_TTL_MS = 5 * 60 * 1000
const POSITIVE_TTL_MS = 24 * 60 * 60 * 1000

type BillingCacheEntry = {
  hasAccess: boolean
  userId: string
  at: number
}

export function readBillingCache(userId: string): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BillingCacheEntry
    if (parsed.userId !== userId) return null
    const ttl = parsed.hasAccess ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS
    if (Date.now() - parsed.at > ttl) return null
    return parsed.hasAccess
  } catch {
    return null
  }
}

export function writeBillingCache(userId: string, hasAccess: boolean) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      hasAccess,
      userId,
      at: Date.now(),
    }))
  } catch {
    /* quota / private mode */
  }
}

export function clearBillingCache() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}
