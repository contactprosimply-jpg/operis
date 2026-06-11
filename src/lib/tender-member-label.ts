import { memberDisplayName } from '@/lib/family'
import type { OrganizationPayload } from '@/lib/organization'

export function orgMemberLabel(
  org: OrganizationPayload | null,
  userId?: string | null,
): string | null {
  if (!userId || !org?.members?.length) return null
  const member = org.members.find(m => m.user_id === userId)
  return member ? memberDisplayName(member) : null
}

/** Libellé du créateur si l'AO appartient à un autre membre du groupe. */
export function getTenderCreatorLabel(
  tender: { user_id?: string },
  currentUserId: string | undefined | null,
  org: OrganizationPayload | null,
): string | null {
  if (!org || !currentUserId || !tender.user_id) return null
  if (tender.user_id === currentUserId) return null
  return orgMemberLabel(org, tender.user_id)
}

/** Libellé assigné (visible pour le créateur/admin sur ses AO délégués). */
export function getTenderAssigneeLabel(
  tender: { user_id?: string; assigned_to?: string | null },
  currentUserId: string | undefined | null,
  org: OrganizationPayload | null,
): string | null {
  if (!org || !tender.assigned_to) return null
  if (tender.assigned_to === currentUserId) return null
  if (tender.user_id === currentUserId || org.is_owner) {
    return orgMemberLabel(org, tender.assigned_to)
  }
  return null
}

export function creatorColumnLabel(
  tender: { user_id?: string },
  currentUserId: string | undefined | null,
  org: OrganizationPayload | null,
): string {
  if (!tender.user_id) return '—'
  if (!org) return '—'
  if (tender.user_id === currentUserId) return 'Vous'
  return orgMemberLabel(org, tender.user_id) ?? '—'
}
