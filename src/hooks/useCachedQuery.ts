'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { readCache, writeCache } from '@/lib/client-cache'

type UseCachedQueryOptions<T> = {
  enabled?: boolean
  maxAgeMs?: number
  onSuccess?: (data: T) => void
}

/**
 * stale-while-revalidate : affiche le cache immédiatement, rafraîchit en arrière-plan.
 */
export function useCachedQuery<T>(
  cacheKey: string | null,
  fetcher: () => Promise<T | null>,
  options: UseCachedQueryOptions<T> = {},
) {
  const { enabled = true, maxAgeMs = 10 * 60_000, onSuccess } = options
  const cached = cacheKey ? readCache<T>(cacheKey, maxAgeMs) : null
  const [data, setData] = useState<T | null>(cached)
  const [loading, setLoading] = useState(enabled && !cached)
  const [refreshing, setRefreshing] = useState(false)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const refetch = useCallback(async (silent = false) => {
    if (!cacheKey || !enabled) return
    if (silent) setRefreshing(true)
    else if (!data) setLoading(true)
    try {
      const next = await fetcherRef.current()
      if (next != null) {
        setData(next)
        writeCache(cacheKey, next)
        onSuccess?.(next)
      }
    } catch { /* garde cache */ }
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [cacheKey, enabled, data, onSuccess])

  useEffect(() => {
    if (!cacheKey || !enabled) {
      setLoading(false)
      return
    }
    const stale = readCache<T>(cacheKey, maxAgeMs)
    if (stale) {
      setData(stale)
      setLoading(false)
      void refetch(true)
    } else {
      void refetch(false)
    }
  }, [cacheKey, enabled, maxAgeMs]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, setData, loading, refreshing, refetch }
}
