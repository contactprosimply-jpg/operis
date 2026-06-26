'use client'

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  cachedToEmail,
  queryCachedMailList,
  type MailListQueryOpts,
} from '@/lib/mailCache'
import type { Email } from '@/types/database'

export type CachedMailListFilters = Omit<MailListQueryOpts, 'folderKey'>

export function useCachedMailList(
  folderKey: string | null,
  filters: CachedMailListFilters,
): Email[] {
  const rows = useLiveQuery(
    () => (folderKey ? queryCachedMailList({ folderKey, ...filters }) : []),
    [
      folderKey,
      filters.searchQuery,
      filters.favoritesOnly,
      filters.listFilter,
      filters.priorityFilter,
      filters.fromFilter,
      filters.tenderFilter,
      filters.labelFilter,
      filters.sinceFilter,
      filters.untilFilter,
      filters.sortOrder,
    ],
  )

  return useMemo(() => (rows ?? []).map(cachedToEmail), [rows])
}
