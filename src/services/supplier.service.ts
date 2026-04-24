// ============================================================
// OPERIS — services/supplier.service.ts
// ============================================================

import { supplierRepository } from '@/repositories/supplier.repository'
import { CreateSupplierPayload, ApiResponse, Supplier } from '@/types/database'

export const supplierService = {

  async getAll(userId: string): Promise<ApiResponse<Supplier[]>> {
    try {
      const data = await supplierRepository.findAll(userId)
      return { success: true, data }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },

  async create(userId: string, payload: CreateSupplierPayload): Promise<ApiResponse<Supplier>> {
    try {
      if (!payload.name || !payload.email) {
        return { success: false, error: 'Nom et email obligatoires' }
      }
      // Validation email basique
      if (!payload.email.includes('@')) {
        return { success: false, error: 'Email invalide' }
      }
      const data = await supplierRepository.create(userId, payload)
      return { success: true, data }
    } catch (e: any) {
      if (e.message.includes('unique')) {
        return { success: false, error: 'Un fournisseur avec cet email existe déjà' }
      }
      return { success: false, error: e.message }
    }
  },

  async delete(id: string, userId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    try {
      await supplierRepository.delete(id, userId)
      return { success: true, data: { deleted: true } }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },
}
