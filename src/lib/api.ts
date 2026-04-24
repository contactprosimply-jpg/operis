// ============================================================
// OPERIS — lib/api.ts
// Client API typé — toutes les fonctions pour appeler le backend
// ============================================================

import { supabase } from './supabase'
import {
  TenderStats,
  TenderDetail,
  Tender,
  Supplier,
  CreateTenderPayload,
  UpdateTenderPayload,
  CreateSupplierPayload,
  TenderStatus,
  Email,
  ApiResponse,
} from '@/types/database'

// ── Helper : récupérer le token auth ─────────────────────────
async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token ?? ''
  console.log('Token:', token ? 'OK' : 'VIDE')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }
}

// ── Helper fetch générique ────────────────────────────────────
async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = await getAuthHeaders()
  const res = await fetch(url, { ...options, headers })
  return res.json()
}

// ============================================================
// TENDERS
// ============================================================

export const tendersApi = {

  getAll: () =>
    apiFetch<TenderStats[]>('/api/tenders'),

  getById: (id: string) =>
    apiFetch<TenderDetail>(`/api/tenders/${id}`),

  create: (payload: CreateTenderPayload) =>
    apiFetch<Tender>('/api/tenders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: UpdateTenderPayload) =>
    apiFetch<Tender>(`/api/tenders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/tenders/${id}`, {
      method: 'DELETE',
    }),

  markStatus: (id: string, status: TenderStatus) =>
    apiFetch<Tender>(`/api/tenders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  addSupplier: (tenderId: string, supplierId: string) =>
    apiFetch<{ added: boolean }>(`/api/tenders/${tenderId}/suppliers`, {
      method: 'POST',
      body: JSON.stringify({ supplier_id: supplierId }),
    }),

  sendConsultation: (tenderId: string, supplierIds: string[]) =>
    apiFetch<{ sent: number; errors: number }>(`/api/tenders/${tenderId}/consult`, {
      method: 'POST',
      body: JSON.stringify({ supplier_ids: supplierIds }),
    }),

  relaunchSupplier: (tenderId: string, supplierId: string) =>
    apiFetch<{ relaunched: boolean }>(`/api/tenders/${tenderId}/relaunch`, {
      method: 'POST',
      body: JSON.stringify({ supplier_id: supplierId }),
    }),

  relaunchAll: (tenderId: string) =>
    apiFetch<{ sent: number }>(`/api/tenders/${tenderId}/relaunch`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
}

// ============================================================
// SUPPLIERS
// ============================================================

export const suppliersApi = {

  getAll: () =>
    apiFetch<Supplier[]>('/api/suppliers'),

  create: (payload: CreateSupplierPayload) =>
    apiFetch<Supplier>('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/suppliers/${id}`, {
      method: 'DELETE',
    }),
}

// ============================================================
// MAIL
// ============================================================

export const mailApi = {

  sync: () =>
  apiFetch<{ fetched: number; stored: number; aoDetected: number }>('/api/mail/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  }),

  getEmails: (filters?: { ao?: boolean; unread?: boolean }) => {
    const params = new URLSearchParams()
    if (filters?.ao !== undefined) params.set('ao', String(filters.ao))
    if (filters?.unread) params.set('unread', 'true')
    return apiFetch<Email[]>(`/api/mail/emails?${params.toString()}`)
  },

  createTenderFromEmail: (emailId: string) =>
    apiFetch<{ tender_id: string }>(`/api/mail/emails/${emailId}/ao`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
}
