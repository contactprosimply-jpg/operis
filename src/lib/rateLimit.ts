// In-memory rate limiter — max N requests per window per userId

interface RateEntry {
  count: number
  windowStart: number
}

const store = new Map<string, RateEntry>()

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_REQUESTS = 45 // sync auto ~12/h + clics manuels

export function checkRateLimit(userId: string): { allowed: boolean; retryAfterMinutes: number } {
  const now = Date.now()
  const entry = store.get(userId)

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(userId, { count: 1, windowStart: now })
    return { allowed: true, retryAfterMinutes: 0 }
  }

  if (entry.count >= MAX_REQUESTS) {
    const retryMs = WINDOW_MS - (now - entry.windowStart)
    return { allowed: false, retryAfterMinutes: Math.ceil(retryMs / 60000) }
  }

  entry.count += 1
  return { allowed: true, retryAfterMinutes: 0 }
}
