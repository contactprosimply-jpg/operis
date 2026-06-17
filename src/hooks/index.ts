// ============================================================
// OPERIS — hooks/useTenders.ts + useSuppliers.ts + useMail.ts
// Hooks React pour fetcher les données depuis l'API
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { tendersApi, suppliersApi, mailApi } from '@/lib/api'
import {
  TenderStats,
  TenderDetail,
  Supplier,
  Email,
  CreateTenderPayload,
  CreateSupplierPayload,
  TenderStatus,
} from '@/types/database'

const MIN_HIDDEN_MS = 5000
const REFOCUS_DEBOUNCE_MS = 800
const LOADING_GUARD_MS = 8000

function useLoadingGuard(loading: boolean, setLoading: (value: boolean) => void) {
  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => setLoading(false), LOADING_GUARD_MS)
    return () => clearTimeout(timer)
  }, [loading, setLoading])
}

// ── Rafraîchir quand l'onglet redevient visible (throttle, pas à chaque refocus) ──
export function useRefreshOnFocus(refetch: (silent?: boolean) => void, enabled = true) {
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch
  const hiddenAtRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
        return
      }
      if (document.visibilityState !== 'visible') return

      const hiddenMs = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : MIN_HIDDEN_MS
      if (hiddenMs < MIN_HIDDEN_MS) return

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (document.visibilityState === 'visible') refetchRef.current(true)
      }, REFOCUS_DEBOUNCE_MS)
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [enabled])
}

// ── Hook : liste des AO ──────────────────────────────────────
export function useTenders() {
  const { userId } = useAuth()
  const [tenders, setTenders] = useState<TenderStats[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useLoadingGuard(loading, setLoading)

  const fetch = useCallback(async (silent = false) => {
    if (!userId) {
      setLoading(false)
      return
    }
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await tendersApi.getAll()
      if (res.success) setTenders(res.data)
      else setError(res.error ?? null)
    } catch {
      /* garde le dernier état connu */
    } finally {
      if (silent) setRefreshing(false)
      else setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    fetch(false)
  }, [fetch, userId])

  useRefreshOnFocus(fetch, !!userId)

  const create = async (payload: CreateTenderPayload) => {
    const res = await tendersApi.create(payload)
    if (res.success) await fetch(true)
    return res
  }

  const markStatus = async (id: string, status: TenderStatus) => {
    const prev = tenders
    setTenders(ts => ts.map(t => (t.tender_id === id ? { ...t, status } : t)))
    const res = await tendersApi.markStatus(id, status)
    if (res.success) await fetch(true)
    else setTenders(prev)
    return res
  }

  const remove = async (id: string) => {
    const res = await tendersApi.delete(id)
    if (res.success) await fetch(true)
    return res
  }

  return { tenders, loading, refreshing, error, refetch: fetch, create, markStatus, remove }
}

// ── Hook : détail d'un AO ─────────────────────────────────────
export function useTenderDetail(id: string) {
  const { userId } = useAuth()
  const [tender, setTender] = useState<TenderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useLoadingGuard(loading, setLoading)

  const fetch = useCallback(async (silent = false) => {
    if (!id || !userId) {
      if (!silent) setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    try {
      const res = await tendersApi.getById(id)
      if (res.success) setTender(res.data)
      else setError(res.error ?? null)
    } catch {
      /* garde le dernier état connu */
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id, userId])

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    fetch(false)
  }, [fetch, userId])

  useRefreshOnFocus(fetch, !!userId && !!id)

  const addSupplier = async (supplierId: string) => {
    const res = await tendersApi.addSupplier(id, supplierId)
    if (res.success) await fetch(true)
    return res
  }

  const sendConsultation = async (supplierId: string[]) => {
    const res = await tendersApi.sendConsultation(id, supplierId)
    if (res.success) await fetch(true)
    return res
  }

  const relaunchSupplier = async (supplierId: string) => {
    const res = await tendersApi.relaunchSupplier(id, supplierId)
    if (res.success) await fetch(true)
    return res
  }

  const relaunchAll = async () => {
    const res = await tendersApi.relaunchAll(id)
    if (res.success) await fetch(true)
    return res
  }

  const markStatus = async (status: TenderStatus) => {
    const prev = tender
    if (tender) setTender({ ...tender, status })
    const res = await tendersApi.markStatus(id, status)
    if (res.success) await fetch(true)
    else if (prev) setTender(prev)
    return res
  }

  return {
    tender, loading, error, refetch: fetch,
    addSupplier, sendConsultation, relaunchSupplier, relaunchAll, markStatus,
  }
}

// ── Hook : fournisseurs ───────────────────────────────────────
export function useSuppliers() {
  const { userId } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  useLoadingGuard(loading, setLoading)

  const fetch = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await suppliersApi.getAll()
      if (res.success) setSuppliers(res.data)
    } catch {
      /* garde le dernier état connu */
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    fetch()
  }, [fetch, userId])

  const create = async (payload: CreateSupplierPayload) => {
    const res = await suppliersApi.create(payload)
    if (res.success) await fetch()
    return res
  }

  const remove = async (id: string) => {
    const res = await suppliersApi.delete(id)
    if (res.success) await fetch()
    return res
  }

  return { suppliers, loading, refetch: fetch, create, remove }
}

// ── Hook : boîte mail ─────────────────────────────────────────
export function useMail(filters?: { ao?: boolean; unread?: boolean }) {
  const { userId } = useAuth()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useLoadingGuard(loading, setLoading)

  const fetch = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await mailApi.getEmails(filters)
      if (res.success) setEmails(res.data)
    } catch {
      /* garde le dernier état connu */
    } finally {
      setLoading(false)
    }
  }, [userId, filters?.ao, filters?.unread])

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    fetch()
  }, [fetch, userId])

  const sync = async () => {
    setSyncing(true)
    try {
      const res = await mailApi.sync()
      if (res.success) await fetch()
      return res
    } finally {
      setSyncing(false)
    }
  }

  const createTenderFromEmail = async (emailId: string) => {
    const res = await mailApi.createTenderFromEmail(emailId)
    if (res.success) await fetch()
    return res
  }

  return { emails, loading, syncing, refetch: fetch, sync, createTenderFromEmail }
}
