// ============================================================
// OPERIS — repositories/consultation.repository.ts
// Accès DB pour les consultations fournisseurs
// ============================================================

import { createAdminClient } from '@/lib/supabase'
import { ConsultationSupplier, ConsultationStatus } from '@/types/database'

export const consultationRepository = {

  // ── Récupérer toutes les consultations d'un AO ────────────
  async findByTender(tenderId: string): Promise<ConsultationSupplier[]> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('consultation_suppliers')
      .select('*')
      .eq('tender_id', tenderId)

    if (error) throw new Error(error.message)
    return data as ConsultationSupplier[]
  },

  // ── Ajouter un fournisseur à un AO ───────────────────────
  async addSupplier(tenderId: string, supplierId: string): Promise<ConsultationSupplier> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('consultation_suppliers')
      .insert({ tender_id: tenderId, supplier_id: supplierId })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data as ConsultationSupplier
  },

  // ── Mettre à jour le statut d'une consultation ────────────
  async updateStatus(
    tenderId: string,
    supplierId: string,
    status: ConsultationStatus,
    extraFields: Partial<ConsultationSupplier> = {}
  ): Promise<ConsultationSupplier> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('consultation_suppliers')
      .update({ status, ...extraFields })
      .eq('tender_id', tenderId)
      .eq('supplier_id', supplierId)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data as ConsultationSupplier
  },

  // ── Récupérer les fournisseurs non-répondants ─────────────
  async findNonResponders(tenderId: string): Promise<ConsultationSupplier[]> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('consultation_suppliers')
      .select('*')
      .eq('tender_id', tenderId)
      .in('status', ['envoye', 'relance'])

    if (error) throw new Error(error.message)
    return data as ConsultationSupplier[]
  },
}
