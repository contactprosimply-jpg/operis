// ============================================================
// OPERIS — repositories/tender.repository.ts
// Accès DB pour les tenders — pas de logique métier ici
// ============================================================

import { createAdminClient } from '@/lib/supabase'
import {
  Tender,
  TenderDetail,
  TenderStats,
  CreateTenderPayload,
  UpdateTenderPayload,
} from '@/types/database'

export const tenderRepository = {

  // ── Lister tous les tenders d'un utilisateur ──────────────
  async findAll(userId: string): Promise<TenderStats[]> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('tender_stats')
      .select('*')
      .eq('user_id' as any, userId)

    if (error) throw new Error(error.message)
    return data as TenderStats[]
  },

  // ── Récupérer un tender par ID ────────────────────────────
  async findById(id: string, userId: string): Promise<TenderDetail | null> {
    const db = createAdminClient()

    const { data: tender, error } = await db
      .from('tenders')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (error || !tender) return null

    // Charger les consultations avec fournisseurs
    const { data: consultations } = await db
      .from('consultation_suppliers')
      .select('*, supplier:suppliers(*)')
      .eq('tender_id', id)

    // Charger les devis avec fournisseurs
    const { data: quotes } = await db
      .from('quotes')
      .select('*, supplier:suppliers(*)')
      .eq('tender_id', id)

    // Charger les stats
    const { data: stats } = await db
      .from('tender_stats')
      .select('*')
      .eq('tender_id', id)
      .single()

    return {
      ...tender,
      consultations: consultations ?? [],
      quotes: quotes ?? [],
      stats: stats as TenderStats,
    } as TenderDetail
  },

  // ── Créer un tender ───────────────────────────────────────
  async create(userId: string, payload: CreateTenderPayload): Promise<Tender> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('tenders')
      .insert({ ...payload, user_id: userId })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data as Tender
  },

  // ── Mettre à jour un tender ───────────────────────────────
  async update(id: string, userId: string, payload: UpdateTenderPayload): Promise<Tender> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('tenders')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data as Tender
  },

  // ── Supprimer un tender ───────────────────────────────────
  async delete(id: string, userId: string): Promise<void> {
    const db = createAdminClient()
    const { error } = await db
      .from('tenders')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) throw new Error(error.message)
  },
}
