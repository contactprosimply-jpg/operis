import type { Email } from '@/types/database'
import type { MailFolderSelection } from '@/lib/mail-folders'
import { folderSelectionKey } from '@/lib/mail-folders'
import { readCache, writeCache, cacheKeyForUser } from '@/lib/client-cache'

export type MailListCacheEntry = {
  emails: Email[]
  hasMore: boolean
}

export function mailListQueryKey(
  userId: string,
  selection: MailFolderSelection,
  extras: Record<string, string>,
): string {
  const base = folderSelectionKey(selection)
  const parts = Object.entries(extras).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`)
  return cacheKeyForUser(userId, `mail-list:${base}:${parts.join('&')}`)
}

export function readMailListCache(key: string): MailListCacheEntry | null {
  return readCache<MailListCacheEntry>(key, 15 * 60_000)
}

export function writeMailListCache(key: string, entry: MailListCacheEntry) {
  writeCache(key, entry)
}
