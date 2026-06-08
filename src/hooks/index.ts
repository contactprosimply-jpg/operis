// ============================================================
// OPERIS — hooks/useTenders.ts + useSuppliers.ts + useMail.ts
// Hooks React pour fetcher les données depuis l'API
// ============================================================

import { useState, useEffect, useCallback } from 'react'
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

// ── Rafraîchir quand l'onglet redevient visible ───────────────
export function useRefreshOnFocus(refetch: (silent?: boolean) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refetch, enabled])
}

// ── Hook : liste des AO ──────────────────────────────────────
export function useTenders() {
  const { ready, accessToken } = useAuth()
  const [tenders, setTenders] = useState<TenderStats[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async (silent = false) => {
    if (!accessToken) return
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await tendersApi.getAll()
      if (res.success) setTenders(res.data)
      else setError(res.error ?? null)
    } finally {
      if (silent) setRefreshing(false)
      else setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (!ready || !accessToken) return
    fetch(false)
  }, [fetch, ready, accessToken])

  useRefreshOnFocus(fetch, ready && !!accessToken)

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
  const { ready, accessToken } = useAuth()
  const [tender, setTender] = useState<TenderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async (silent = false) => {
    if (!id || !accessToken) return
    if (!silent) setLoading(true)
    try {
      const res = await tendersApi.getById(id)
      if (res.success) setTender(res.data)
      else setError(res.error ?? null)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id, accessToken])

  useEffect(() => {
    if (!ready || !accessToken) return
    fetch(false)
  }, [fetch, ready, accessToken])

  useRefreshOnFocus(fetch, ready && !!accessToken && !!id)

  const addSupplier = async (supplierId: string) => {
    const res = await tendersApi.addSupplier(id, supplierId)
    if (res.success) await fetch(true)
    return res
  }

  const sendConsultation = async (supplierIds: string[]) => {
    const res = await tendersApi.sendConsultation(id, supplierIds)
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
  const { ready, accessToken } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const res = await suppliersApi.getAll()
      if (res.success) setSuppliers(res.data)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (!ready || !accessToken) return
    fetch()
  }, [fetch, ready, accessToken])

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
  const { ready, accessToken } = useAuth()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetch = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const res = await mailApi.getEmails(filters)
      if (res.success) setEmails(res.data)
    } finally {
      setLoading(false)
    }
  }, [accessToken, filters?.ao, filters?.unread])

  useEffect(() => {
    if (!ready || !accessToken) return
    fetch()
  }, [fetch, ready, accessToken])

  const sync = async () => {
    setSyncing(true)
    const res = await mailApi.sync()
    setSyncing(false)
    if (res.success) await fetch()
    return res
  }

  const createTenderFromEmail = async (emailId: string) => {
    const res = await mailApi.createTenderFromEmail(emailId)
    if (res.success) await fetch()
    return res
  }

  return { emails, loading, syncing, refetch: fetch, sync, createTenderFromEmail }
}
