import type { SupabaseClient } from '@supabase/supabase-js'
import { getFamilyContext, type FamilyMember } from '@/lib/family'
import { createAdminClient } from '@/lib/supabase'

export interface TenderAccessScope {
  userId: string
  isOrgOwner: boolean
  organizationId: string | null
  members: FamilyMember[]
  /** Tous les user_id du groupe (créateur + membres) */
  teamUserIds: string[]
}

export interface TenderRowRef {
  user_id: string
  assigned_to?: string | null
}

export async function getTenderAccessScope(userId: string): Promise<TenderAccessScope> {
  const ctx = await getFamilyContext(userId)
  const teamSet = new Set<string>([userId, ...ctx.members.map(m => m.user_id)])

  return {
    userId,
    isOrgOwner: ctx.isOwner,
    organizationId: ctx.organizationId,
    members: ctx.members,
    teamUserIds: [...teamSet],
  }
}

export function canViewTender(scope: TenderAccessScope, tender: TenderRowRef): boolean {
  if (scope.isOrgOwner && scope.organizationId) {
    return scope.teamUserIds.includes(tender.user_id)
  }
  if (scope.organizationId) {
    return tender.user_id === scope.userId || tender.assigned_to === scope.userId
  }
  return tender.user_id === scope.userId
}

export function canPatchTender(scope: TenderAccessScope, tender: TenderRowRef): boolean {
  if (!canViewTender(scope, tender)) return false
  if (scope.isOrgOwner && scope.organizationId) return true
  return tender.user_id === scope.userId || tender.assigned_to === scope.userId
}

export function canDeleteTender(scope: TenderAccessScope, tender: TenderRowRef): boolean {
  if (scope.isOrgOwner && scope.organizationId) {
    return scope.teamUserIds.includes(tender.user_id)
  }
  if (!scope.organizationId) {
    return tender.user_id === scope.userId
  }
  return false
}

export function canAssignTender(scope: TenderAccessScope): boolean {
  return scope.isOrgOwner && scope.organizationId !== null
}

export async function getTenderIfAccessible(
  tenderId: string,
  userId: string,
  mode: 'view' | 'mutate' | 'delete' = 'view',
) {
  const scope = await getTenderAccessScope(userId)
  const db = createAdminClient()
  const { data: tender } = await db
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .maybeSingle()

  if (!tender) return null

  if (mode === 'delete' && !canDeleteTender(scope, tender)) return null
  if (mode === 'mutate' && !canPatchTender(scope, tender)) return null
  if (mode === 'view' && !canViewTender(scope, tender)) return null

  return { tender, scope }
}

/** Vérifie l'accès tender pour les routes qui n'ont que l'id (documents, etc.) */
export async function assertTenderAccess(
  db: SupabaseClient,
  tenderId: string,
  userId: string,
  mode: 'view' | 'mutate' | 'delete' = 'view',
) {
  const scope = await getTenderAccessScope(userId)
  const { data: tender } = await db
    .from('tenders')
    .select('id, user_id, assigned_to')
    .eq('id', tenderId)
    .maybeSingle()

  if (!tender) return { ok: false as const, status: 404, error: 'AO introuvable' }
  if (mode === 'delete' && !canDeleteTender(scope, tender)) {
    return { ok: false as const, status: 403, error: 'Suppression reservee au createur du groupe' }
  }
  if (mode === 'mutate' && !canPatchTender(scope, tender)) {
    return { ok: false as const, status: 403, error: 'Acces refuse' }
  }
  if (mode === 'view' && !canViewTender(scope, tender)) {
    return { ok: false as const, status: 404, error: 'AO introuvable' }
  }
  return { ok: true as const, tender, scope }
}
