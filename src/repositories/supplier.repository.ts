// ============================================================
// OPERIS — repositories/supplier.repository.ts
// ============================================================

import { createAdminClient } from '@/lib/supabase'
import { Supplier, CreateSupplierPayload } from '@/types/database'

export const supplierRepository = {

  async findAll(userId: string): Promise<Supplier[]> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('suppliers')
      .select('*')
      .eq('user_id', userId)
      .order('name')

    if (error) throw new Error(error.message)
    return data as Supplier[]
  },

  async findById(id: string, userId: string): Promise<Supplier | null> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (error) return null
    return data as Supplier
  },

  async create(userId: string, payload: CreateSupplierPayload): Promise<Supplier> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('suppliers')
      .insert({ ...payload, user_id: userId })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data as Supplier
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
}
