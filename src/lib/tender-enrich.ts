import { memberDisplayName } from '@/lib/family'
import type { TenderAccessScope } from '@/lib/tender-access'
import { createAdminClient } from '@/lib/supabase'

export interface TenderMemberLabels {
  creator_label: string | null
  assignee_label: string | null
}

function memberLabel(scope: TenderAccessScope, userId?: string | null): string | null {
  if (!userId) return null
  const member = scope.members.find(m => m.user_id === userId)
  if (member) return memberDisplayName(member)
  return null
}

export function buildTenderMemberLabels(
  row: { user_id?: string; assigned_to?: string | null },
  scope: TenderAccessScope,
  emailFallback?: Map<string, string>,
): TenderMemberLabels {
  let creator_label: string | null = null
  let assignee_label: string | null = null

  if (row.user_id && row.user_id !== scope.userId) {
    creator_label = memberLabel(scope, row.user_id)
    if (!creator_label && emailFallback?.has(row.user_id)) {
      creator_label = emailFallback.get(row.user_id) ?? null
    }
    if (!creator_label) creator_label = 'Membre'
  }

  if (
    row.assigned_to
    && row.assigned_to !== scope.userId
    && (row.user_id === scope.userId || scope.isOrgOwner)
  ) {
    assignee_label = memberLabel(scope, row.assigned_to)
    if (!assignee_label && emailFallback?.has(row.assigned_to)) {
      assignee_label = emailFallback.get(row.assigned_to) ?? null
    }
  }

  return { creator_label, assignee_label }
}

export async function enrichTenderRows<T extends { tender_id?: string; user_id?: string; assigned_to?: string | null }>(
  rows: T[],
  scope: TenderAccessScope,
): Promise<Array<T & TenderMemberLabels>> {
  if (!scope.organizationId || !rows.length) {
    return rows.map(row => ({ ...row, creator_label: null, assignee_label: null }))
  }

  const missingUserIds = new Set<string>()
  for (const row of rows) {
    if (row.user_id && row.user_id !== scope.userId && !scope.members.some(m => m.user_id === row.user_id)) {
      missingUserIds.add(row.user_id)
    }
    if (row.assigned_to && !scope.members.some(m => m.user_id === row.assigned_to)) {
      missingUserIds.add(row.assigned_to)
    }
  }

  const rowsMissingOwner = rows.filter(r => r.tender_id && !r.user_id)
  const db = createAdminClient()
  const ownerByTenderId = new Map<string, string>()

  if (rowsMissingOwner.length) {
    const { data: owners } = await db
      .from('tenders')
      .select('id, user_id')
      .in('id', rowsMissingOwner.map(r => r.tender_id!))
    for (const o of owners ?? []) {
      if (o.user_id) ownerByTenderId.set(o.id, o.user_id)
      if (o.user_id && !scope.members.some(m => m.user_id === o.user_id)) {
        missingUserIds.add(o.user_id)
      }
    }
  }

  const emailFallback = new Map<string, string>()
  for (const uid of missingUserIds) {
    const { data: { user } } = await db.auth.admin.getUserById(uid)
    const email = user?.email
    if (email) emailFallback.set(uid, email.split('@')[0])
  }

  return rows.map(row => {
    const user_id = row.user_id ?? (row.tender_id ? ownerByTenderId.get(row.tender_id) : undefined)
    const labels = buildTenderMemberLabels({ ...row, user_id }, scope, emailFallback)
    return { ...row, user_id, ...labels }
  })
}
