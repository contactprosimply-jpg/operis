// ============================================================
// OPERIS — hooks/useTenders.ts + useSuppliers.ts + useMail.ts
// Hooks React pour fetcher les données depuis l'API
// ============================================================

import { useState, useEffect, useCallback } from 'react'
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

// ── Hook : liste des AO ──────────────────────────────────────
export function useTenders() {
  const [tenders, setTenders] = useState<TenderStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const res = await tendersApi.getAll()
    if (res.success) setTenders(res.data)
    else setError(res.error)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const create = async (payload: CreateTenderPayload) => {
    const res = await tendersApi.create(payload)
    if (res.success) await fetch()
    return res
  }

  const markStatus = async (id: string, status: TenderStatus) => {
    const res = await tendersApi.markStatus(id, status)
    if (res.success) await fetch()
    return res
  }

  const remove = async (id: string) => {
    const res = await tendersApi.delete(id)
    if (res.success) await fetch()
    return res
  }

  return { tenders, loading, error, refetch: fetch, create, markStatus, remove }
}

// ── Hook : détail d'un AO ─────────────────────────────────────
export function useTenderDetail(id: string) {
  const [tender, setTender] = useState<TenderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const res = await tendersApi.getById(id)
    if (res.success) setTender(res.data)
    else setError(res.error)
    setLoading(false)
  }, [id])

  useEffect(() => { fetch() }, [fetch])

  const addSupplier = async (supplierId: string) => {
    const res = await tendersApi.addSupplier(id, supplierId)
    if (res.success) await fetch()
    return res
  }

  const sendConsultation = async (supplierIds: string[]) => {
    const res = await tendersApi.sendConsultation(id, supplierIds)
    if (res.success) await fetch()
    return res
  }

  const relaunchSupplier = async (supplierId: string) => {
    const res = await tendersApi.relaunchSupplier(id, supplierId)
    if (res.success) await fetch()
    return res
  }

  const relaunchAll = async () => {
    const res = await tendersApi.relaunchAll(id)
    if (res.success) await fetch()
    return res
  }

  const markStatus = async (status: TenderStatus) => {
    const res = await tendersApi.markStatus(id, status)
    if (res.success) await fetch()
    return res
  }

  return {
    tender, loading, error, refetch: fetch,
    addSupplier, sendConsultation, relaunchSupplier, relaunchAll, markStatus,
  }
}

// ── Hook : fournisseurs ───────────────────────────────────────
export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const res = await suppliersApi.getAll()
    if (res.success) setSuppliers(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

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
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const res = await mailApi.getEmails(filters)
    if (res.success) setEmails(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

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
