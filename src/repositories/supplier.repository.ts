// ============================================================
// OPERIS — repositories/supplier.repository.ts
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase'
import { Supplier, CreateSupplierPayload } from '@/types/database'
import { getSupplierResponseRates } from '@/lib/supplier-stats'

type SupplierRow = Omit<Supplier, 'corps_etats' | 'response_rate'>

async function getCorpsEtatsBySupplier(db: SupabaseClient, supplierIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (supplierIds.length === 0) return result

  const { data, error } = await db
    .from('supplier_corps_etats')
    .select('supplier_id, corps_etat_id')
    .in('supplier_id', supplierIds)

  if (error) throw new Error(error.message)

  for (const row of (data ?? []) as { supplier_id: string; corps_etat_id: string }[]) {
    const list = result.get(row.supplier_id) ?? []
    list.push(row.corps_etat_id)
    result.set(row.supplier_id, list)
  }
  return result
}

function toSupplier(
  row: SupplierRow,
  corpsEtatsBySupplier: Map<string, string[]>,
  responseRates: Map<string, NonNullable<Supplier['response_rate']>>,
): Supplier {
  return {
    ...row,
    corps_etats: corpsEtatsBySupplier.get(row.id) ?? [],
    response_rate: responseRates.get(row.id) ?? null,
  }
}

export const supplierRepository = {

  async findAll(userId: string): Promise<Supplier[]> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('suppliers')
      .select('*')
      .eq('user_id', userId)
      .order('name')

    if (error) throw new Error(error.message)
    const rows = (data ?? []) as SupplierRow[]
    const ids = rows.map(r => r.id)

    const [corpsEtatsBySupplier, responseRates] = await Promise.all([
      getCorpsEtatsBySupplier(db, ids),
      getSupplierResponseRates(db, ids),
    ])
    return rows.map(r => toSupplier(r, corpsEtatsBySupplier, responseRates))
  },

  async findById(id: string, userId: string): Promise<Supplier | null> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (error || !data) return null

    const [corpsEtatsBySupplier, responseRates] = await Promise.all([
      getCorpsEtatsBySupplier(db, [id]),
      getSupplierResponseRates(db, [id]),
    ])
    return toSupplier(data as SupplierRow, corpsEtatsBySupplier, responseRates)
  },

  async create(userId: string, payload: CreateSupplierPayload): Promise<Supplier> {
    const db = createAdminClient()
    const { corps_etats, ...rest } = payload

    const { data, error } = await db
      .from('suppliers')
      .insert({ ...rest, user_id: userId })
      .select()
      .single()

    if (error) throw new Error(error.message)
    const row = data as SupplierRow

    if (corps_etats?.length) {
      await supplierRepository.setCorpsEtats(row.id, corps_etats)
    }

    return { ...row, corps_etats: corps_etats ?? [], response_rate: null }
  },

  async delete(id: string, userId: string): Promise<void> {
    const db = createAdminClient()
    const { error } = await db
      .from('suppliers')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) throw new Error(error.message)
  },

  async getCorpsEtats(supplierId: string): Promise<string[]> {
    const db = createAdminClient()
    const map = await getCorpsEtatsBySupplier(db, [supplierId])
    return map.get(supplierId) ?? []
  },

  // Remplace intégralement l'ensemble des corps d'état d'un fournisseur (delete + insert :
  // plus simple qu'un diff, et le volume par fournisseur est trop faible pour que ça coûte).
  async setCorpsEtats(supplierId: string, corpsEtatIds: string[]): Promise<void> {
    const db = createAdminClient()

    const { error: delErr } = await db
      .from('supplier_corps_etats')
      .delete()
      .eq('supplier_id', supplierId)
    if (delErr) throw new Error(delErr.message)

    if (corpsEtatIds.length === 0) return

    const { error: insErr } = await db
      .from('supplier_corps_etats')
      .insert(corpsEtatIds.map(corps_etat_id => ({ supplier_id: supplierId, corps_etat_id })))
    if (insErr) throw new Error(insErr.message)
  },
}
