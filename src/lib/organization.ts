import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase'

export const MEMBER_COLORS = ['#3b7ef6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#06b6d4']

export interface OrgMemberRow {
  id: string
  user_id: string
  role: string
  display_name: string | null
  email: string | null
  color: string | null
  created_at: string
  number: number
}

export interface OrganizationPayload {
  id: string
  name: string
  owner_id: string
  owner_email: string | null
  is_owner: boolean
  my_number: number | null
  members: OrgMemberRow[]
  invite_link: string | null
  owned_groups?: Array<{ id: string; name: string }>
}

export function appBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export function buildInviteLink(token: string): string {
  return `${appBaseUrl()}/join/${token}`
}

export function generateInviteToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function listOwnedOrganizations(db: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await db
    .from('organizations')
    .select('id, name, owner_id, created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function userBelongsToOrganization(db: ReturnType<typeof createAdminClient>, userId: string) {
  const owned = await listOwnedOrganizations(db, userId)
  if (owned.length) return { type: 'owner' as const, organizationId: owned[0].id }

  const { data: memberships } = await db
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)

  const membership = memberships?.[0]
  if (membership) return { type: 'member' as const, organizationId: membership.organization_id as string }
  return null
}

async function purgeOrganization(db: ReturnType<typeof createAdminClient>, organizationId: string) {
  const { error: inviteErr } = await db
    .from('organization_invites')
    .delete()
    .eq('organization_id', organizationId)
  if (inviteErr && !inviteErr.message.includes('organization_invites')) {
    return inviteErr
  }

  const { error: membersErr } = await db
    .from('organization_members')
    .delete()
    .eq('organization_id', organizationId)
  if (membersErr) return membersErr

  const { error } = await db.from('organizations').delete().eq('id', organizationId)
  return error
}

async function resolveMemberEmails(
  db: ReturnType<typeof createAdminClient>,
  rows: Array<{
    id: string
    user_id: string
    role: string
    display_name: string | null
    email: string | null
    color: string | null
    created_at: string
  }>,
) {
  const members = []
  for (const row of rows) {
    let email = row.email
    if (!email) {
      const { data: { user } } = await db.auth.admin.getUserById(row.user_id)
      email = user?.email ?? null
    }
    members.push({ ...row, email })
  }
  return members
}

export function orderMembersWithNumbers(
  ownerId: string,
  members: Array<{
    id: string
    user_id: string
    role: string
    display_name: string | null
    email: string | null
    color: string | null
    created_at: string
  }>,
): OrgMemberRow[] {
  const ownerRow = members.find(m => m.user_id === ownerId)
  const others = members
    .filter(m => m.user_id !== ownerId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const ordered = ownerRow ? [ownerRow, ...others] : others
  return ordered.map((m, index) => ({ ...m, number: index + 1 }))
}

export async function getActiveInviteToken(
  db: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<string | null> {
  const { data } = await db
    .from('organization_invites')
    .select('token, expires_at, revoked_at')
    .eq('organization_id', organizationId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.token) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null
  return data.token
}

export async function createOrganizationInvite(
  db: ReturnType<typeof createAdminClient>,
  organizationId: string,
  createdBy: string,
) {
  await db
    .from('organization_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .is('revoked_at', null)

  const token = generateInviteToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { error } = await db.from('organization_invites').insert({
    organization_id: organizationId,
    token,
    created_by: createdBy,
    expires_at: expiresAt.toISOString(),
  })

  if (error) throw new Error(error.message)
  return token
}

export async function getOrganizationPayloadForUser(userId: string): Promise<OrganizationPayload | null> {
  const db = createAdminClient()

  const ownedList = await listOwnedOrganizations(db, userId)
  const ownedGroups = ownedList.map(o => ({ id: o.id, name: o.name }))

  let org: { id: string; name: string; owner_id: string } | null = ownedList[0] ?? null
  let isOwner = ownedList.length > 0

  if (!org) {
    const { data: membership } = await db
      .from('organization_members')
      .select('organization_id, organizations(id, name, owner_id)')
      .eq('user_id', userId)
      .maybeSingle()

    const rawOrg = membership?.organizations as
      | { id: string; name: string; owner_id: string }
      | { id: string; name: string; owner_id: string }[]
      | null
    const linked = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg
    if (!linked) return null
    org = linked
    isOwner = linked.owner_id === userId
  }

  const { data: memberRows } = await db
    .from('organization_members')
    .select('id, user_id, role, display_name, email, color, created_at')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: true })

  const withEmails = await resolveMemberEmails(db, memberRows ?? [])
  const members = orderMembersWithNumbers(org.owner_id, withEmails)
  const myMember = members.find(m => m.user_id === userId)

  const { data: { user: ownerAuth } } = await db.auth.admin.getUserById(org.owner_id)
  const ownerEmail = ownerAuth?.email ?? members.find(m => m.user_id === org.owner_id)?.email ?? null

  let inviteLink: string | null = null
  if (isOwner) {
    let token = await getActiveInviteToken(db, org.id)
    if (!token) token = await createOrganizationInvite(db, org.id, userId)
    inviteLink = buildInviteLink(token)
  }

  return {
    id: org.id,
    name: org.name,
    owner_id: org.owner_id,
    owner_email: ownerEmail,
    is_owner: isOwner,
    my_number: myMember?.number ?? null,
    members,
    invite_link: inviteLink,
    owned_groups: ownedGroups.length ? ownedGroups : undefined,
  }
}

export async function deleteOrganizationForOwner(
  userId: string,
  options?: { organizationId?: string; deleteAll?: boolean },
) {
  const db = createAdminClient()
  const owned = await listOwnedOrganizations(db, userId)
  if (!owned.length) return { ok: false as const, error: 'Aucun groupe a supprimer' }

  let targets = owned
  if (options?.organizationId) {
    targets = owned.filter(o => o.id === options.organizationId)
    if (!targets.length) return { ok: false as const, error: 'Groupe introuvable ou non autorise' }
  } else if (!options?.deleteAll) {
    targets = [owned[0]]
  }

  for (const org of targets) {
    const error = await purgeOrganization(db, org.id)
    if (error) return { ok: false as const, error: error.message }
  }

  const names = targets.map(o => o.name).join(', ')
  return { ok: true as const, name: names, deleted_count: targets.length }
}

export async function leaveOrganizationAsMember(userId: string) {
  const db = createAdminClient()
  const { data: membership } = await db
    .from('organization_members')
    .select('id, organization_id, organizations(owner_id)')
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) return { ok: false as const, error: 'Vous ne participez a aucun groupe' }

  const rawOrg = membership.organizations as { owner_id: string } | { owner_id: string }[] | null
  const linked = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg
  if (linked?.owner_id === userId) {
    return { ok: false as const, error: 'Le createur doit supprimer le groupe, pas quitter' }
  }

  const { error } = await db.from('organization_members').delete().eq('id', membership.id)
  if (error) return { ok: false as const, error: error.message }

  return { ok: true as const }
}

export async function getInvitePreview(token: string) {
  const db = createAdminClient()
  const { data: invite } = await db
    .from('organization_invites')
    .select('organization_id, expires_at, revoked_at, organizations(id, name, owner_id)')
    .eq('token', token)
    .maybeSingle()

  const rawOrg = invite?.organizations as
    | { id: string; name: string; owner_id: string }
    | { id: string; name: string; owner_id: string }[]
    | null
    | undefined
  const org = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg
  if (!invite || !org) return null
  if (invite.revoked_at) return null
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return null
  const { data: { user: ownerUser } } = await db.auth.admin.getUserById(org.owner_id)
  const { count } = await db
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id)

  return {
    organization_id: org.id,
    organization_name: org.name,
    owner_email: ownerUser?.email ?? null,
    owner_name: ownerUser?.user_metadata?.full_name as string | null ?? null,
    member_count: count ?? 0,
  }
}

export async function acceptOrganizationInvite(token: string, userId: string) {
  const db = createAdminClient()
  const preview = await getInvitePreview(token)
  if (!preview) {
    return { ok: false as const, error: 'Lien invalide ou expire' }
  }

  const orgId = preview.organization_id

  const { data: org } = await db.from('organizations').select('owner_id').eq('id', orgId).single()
  if (!org) return { ok: false as const, error: 'Groupe introuvable' }

  if (org.owner_id === userId) {
    return { ok: false as const, error: 'Vous etes deja le createur de ce groupe' }
  }

  const existing = await userBelongsToOrganization(db, userId)
  if (existing?.organizationId === orgId) {
    const payload = await getOrganizationPayloadForUser(userId)
    return { ok: true as const, already_member: true, data: payload }
  }

  if (existing) {
    if (existing.type === 'owner') {
      const { data: ownedOrg } = await db
        .from('organizations')
        .select('name')
        .eq('id', existing.organizationId)
        .maybeSingle()
      const label = ownedOrg?.name ? `"${ownedOrg.name}"` : 'un groupe'
      return {
        ok: false as const,
        error: `Vous avez deja cree ${label}. Supprimez-le dans Parametres > Famille avant de rejoindre celui-ci.`,
      }
    }
    return { ok: false as const, error: 'Vous appartenez deja a un autre groupe' }
  }

  const { data: existingMember } = await db
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingMember) {
    const payload = await getOrganizationPayloadForUser(userId)
    return { ok: true as const, already_member: true, data: payload }
  }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  const { data: { user } } = await db.auth.admin.getUserById(userId)
  const email = user?.email ?? null
  const displayName = profile?.full_name ?? user?.user_metadata?.full_name ?? email

  const { count } = await db
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)

  const { canAddOrgMember } = await import('@/lib/billing/subscription')
  const seatCheck = await canAddOrgMember(db, orgId)
  if (!seatCheck.ok) return { ok: false as const, error: seatCheck.error! }

  const color = MEMBER_COLORS[(count ?? 0) % MEMBER_COLORS.length]

  const { error } = await db.from('organization_members').insert({
    organization_id: orgId,
    user_id: userId,
    role: 'member',
    display_name: displayName,
    email,
    color,
  })

  if (error) {
    if (error.code === '23505') {
      const payload = await getOrganizationPayloadForUser(userId)
      return { ok: true as const, already_member: true, data: payload }
    }
    return { ok: false as const, error: error.message }
  }

  const payload = await getOrganizationPayloadForUser(userId)
  return { ok: true as const, data: payload }
}
