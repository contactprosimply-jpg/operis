// ============================================================
// OPERIS — repositories/tender.repository.ts
// Accès DB pour les tenders — pas de logique métier ici
// ============================================================

import { createAdminClient } from '@/lib/supabase'
import {
  getTenderAccessScope,
  canViewTender,
  canPatchTender,
  canDeleteTender,
} from '@/lib/tender-access'
import {
  Tender,
  TenderDetail,
  TenderStats,
  CreateTenderPayload,
  UpdateTenderPayload,
} from '@/types/database'

export const tenderRepository = {

  async findAll(userId: string): Promise<TenderStats[]> {
    const scope = await getTenderAccessScope(userId)
    const db = createAdminClient()

    let query = db.from('tender_stats').select('*')

    if (scope.isOrgOwner && scope.organizationId) {
      query = query.in('user_id', scope.teamUserIds)
    } else if (scope.organizationId) {
      query = query.or(`user_id.eq.${scope.userId},assigned_to.eq.${scope.userId}`)
    } else {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query.order('deadline', { ascending: true, nullsFirst: false })
    if (error) throw new Error(error.message)
    return data as TenderStats[]
  },

  async findById(id: string, userId: string): Promise<TenderDetail | null> {
    const scope = await getTenderAccessScope(userId)
    const db = createAdminClient()

    const { data: tender, error } = await db
      .from('tenders')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !tender || !canViewTender(scope, tender)) return null

    const { data: consultations } = await db
      .from('consultation_suppliers')
      .select('*, supplier:suppliers(*)')
      .eq('tender_id', id)

    const { data: quotes } = await db
      .from('quotes')
      .select('*, supplier:suppliers(*)')
      .eq('tender_id', id)

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

  async update(id: string, userId: string, payload: UpdateTenderPayload): Promise<Tender> {
    const scope = await getTenderAccessScope(userId)
    const db = createAdminClient()

    const { data: existing } = await db
      .from('tenders')
      .select('user_id, assigned_to')
      .eq('id', id)
      .single()

    if (!existing || !canPatchTender(scope, existing)) {
      throw new Error('AO introuvable')
    }

    // L'assignation (assigned_to) ne passe pas par ici : voir
    // POST /api/organization { action: 'assign' }, seul chemin qui valide
    // que la cible est un membre de l'organisation et trace assigned_by/assigned_at.
    const { data, error } = await db
      .from('tenders')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data as Tender
  },

  async delete(id: string, userId: string): Promise<void> {
    const scope = await getTenderAccessScope(userId)
    const db = createAdminClient()

    const { data: existing } = await db
      .from('tenders')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || !canDeleteTender(scope, existing)) {
      throw new Error('Suppression non autorisee')
    }

    const { error } = await db.from('tenders').delete().eq('id', id)
    if (error) throw new Error(error.message)
  },
}
