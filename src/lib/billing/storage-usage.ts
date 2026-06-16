import type { SupabaseClient } from '@supabase/supabase-js'

export async function getOrgMemberUserIds(db: SupabaseClient, orgId: string): Promise<string[]> {
  const { data: org } = await db.from('organizations').select('owner_id').eq('id', orgId).single()
  const { data: members } = await db
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)

  const ids = new Set<string>()
  if (org?.owner_id) ids.add(org.owner_id)
  for (const row of members ?? []) ids.add(row.user_id as string)
  return [...ids]
}

export async function sumStorageBytesForUserIds(db: SupabaseClient, userIds: string[]): Promise<number> {
  if (!userIds.length) return 0
  const { data, error } = await db
    .from('tender_documents')
    .select('size')
    .in('user_id', userIds)
    .is('deleted_at', null)

  if (error) {
    const { data: fallback } = await db.from('tender_documents').select('size').in('user_id', userIds)
    return (fallback ?? []).reduce((sum, row) => sum + Number(row.size ?? 0), 0)
  }
  return (data ?? []).reduce((sum, row) => sum + Number(row.size ?? 0), 0)
}

export async function getOrgStorageBytes(db: SupabaseClient, orgId: string): Promise<number> {
  const userIds = await getOrgMemberUserIds(db, orgId)
  return sumStorageBytesForUserIds(db, userIds)
}
