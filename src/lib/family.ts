import { createAdminClient } from '@/lib/supabase'

export interface FamilyMember {
  user_id: string
  display_name: string | null
  email: string | null
  color: string | null
}

export interface FamilyContext {
  isOwner: boolean
  organizationId: string | null
  members: FamilyMember[]
  memberUserIds: string[]
}

export async function getFamilyContext(userId: string): Promise<FamilyContext> {
  const empty: FamilyContext = {
    isOwner: false,
    organizationId: null,
    members: [],
    memberUserIds: [],
  }

  const db = createAdminClient()

  let org: { id: string; owner_id: string } | null = null

  const { data: owned } = await db
    .from('organizations')
    .select('id, owner_id')
    .eq('owner_id', userId)
    .maybeSingle()

  if (owned) {
    org = owned
  } else {
    const { data: membership } = await db
      .from('organization_members')
      .select('organizations(id, owner_id)')
      .eq('user_id', userId)
      .maybeSingle()
    const raw = membership?.organizations as { id: string; owner_id: string } | { id: string; owner_id: string }[] | null
    const linked = Array.isArray(raw) ? raw[0] : raw
    if (linked) org = linked
  }

  if (!org) return empty

  const { data: rows } = await db
    .from('organization_members')
    .select('user_id, display_name, email, color')
    .eq('organization_id', org.id)

  const members: FamilyMember[] = []
  for (const row of rows ?? []) {
    let email = row.email as string | null
    if (!email) {
      const { data: { user } } = await db.auth.admin.getUserById(row.user_id)
      email = user?.email ?? null
    }
    members.push({
      user_id: row.user_id,
      display_name: row.display_name ?? null,
      email,
      color: row.color ?? null,
    })
  }

  const memberUserIds = members
    .map(m => m.user_id)
    .filter(id => id !== userId)

  return {
    isOwner: org.owner_id === userId,
    organizationId: org.id,
    members,
    memberUserIds,
  }
}

export function memberDisplayName(member: FamilyMember): string {
  return member.display_name?.trim() || member.email?.split('@')[0] || 'Membre'
}
