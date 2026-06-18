import type { Email } from '@/types/database'
import { readCache, writeCache } from '@/lib/client-cache'

const DETAIL_PREFIX = 'mail-detail:'
const MAX_STORED = 80
const BODY_TTL_MS = 30 * 60_000

export type CachedEmailDetail = Email & {
  quote_analysis?: EmailWithQuoteAnalysis
  _cachedAt?: number
}

type EmailWithQuoteAnalysis = {
  price_ht: number | null
  tender_id: string | null
  enriched: boolean
  supplier_missing?: boolean
}

const memory = new Map<string, CachedEmailDetail>()

function detailKey(emailId: string) {
  return `${DETAIL_PREFIX}${emailId}`
}

export function getMailDetailCache(emailId: string): CachedEmailDetail | null {
  if (memory.has(emailId)) return memory.get(emailId) ?? null
  const fromStore = readCache<CachedEmailDetail>(detailKey(emailId), BODY_TTL_MS)
  if (fromStore) {
    memory.set(emailId, fromStore)
    return fromStore
  }
  return null
}

export function setMailDetailCache(emailId: string, email: CachedEmailDetail) {
  const withMeta = { ...email, _cachedAt: Date.now() }
  memory.set(emailId, withMeta)
  writeCache(detailKey(emailId), withMeta)

  if (memory.size > MAX_STORED) {
    const oldest = [...memory.entries()].sort(
      (a, b) => (a[1]._cachedAt ?? 0) - (b[1]._cachedAt ?? 0),
    )
    for (let i = 0; i < memory.size - MAX_STORED; i++) {
      memory.delete(oldest[i][0])
    }
  }
}

export function hasMailBodyCached(emailId: string): boolean {
  const c = getMailDetailCache(emailId)
  return Boolean(c?.body_html || c?.body_text)
}
