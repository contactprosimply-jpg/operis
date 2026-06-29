import { authFetch, type AuthFetchOptions } from '@/lib/auth-client'

const WINDOW_MS = 5000
const MAX_REQUESTS = 15
const recent: number[] = []

/** Retourne false si trop de requêtes /api/mail/* récentes (anti-tempête). */
export function canSendMailApiRequest(): boolean {
  const now = Date.now()
  while (recent.length > 0 && recent[0]! < now - WINDOW_MS) recent.shift()
  if (recent.length >= MAX_REQUESTS) {
    console.warn(
      `[operis-mail] Anti-tempête : ${recent.length} requêtes /api/mail/* en ${WINDOW_MS / 1000}s — appel ignoré`,
    )
    return false
  }
  return true
}

function trackMailApiRequest(): void {
  recent.push(Date.now())
}

/** authFetch réservé aux routes /api/mail/* avec garde anti-tempête. */
export async function mailApiFetch(url: string, options: AuthFetchOptions = {}) {
  if (url.includes('/api/mail/') && !canSendMailApiRequest()) {
    throw new Error('mail-api-storm-guard')
  }
  if (url.includes('/api/mail/')) trackMailApiRequest()
  return authFetch(url, options)
}
