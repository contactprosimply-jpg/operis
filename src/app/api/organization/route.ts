export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  buildInviteLink,
  createOrganizationInvite,
  deleteOrganizationForOwner,
  getOrganizationPayloadForUser,
  leaveOrganizationAsMember,
  userBelongsToOrganization,
} from '@/lib/organization'
import { ensureSubscriptionRow } from '@/lib/billing/subscription'
import { canAssignTender, canViewTender, getTenderAccessScope } from '@/lib/tender-access'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const data = await getOrganizationPayloadForUser(userId)
  return Response.json({ success: true, data })
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { name } = await req.json()
  if (!name?.trim()) {
    return Response.json({ success: false, error: 'Nom du groupe requis' }, { status: 400 })
  }

  const db = createAdminClient()
  const existing = await userBelongsToOrganization(db, userId)
  if (existing) {
    if (existing.type === 'owner') {
      const { data: ownedOrg } = await db.from('organizations').select('name').eq('id', existing.organizationId).maybeSingle()
      return Response.json({
        success: false,
        error: `Vous avez deja le groupe "${ownedOrg?.name ?? 'existant'}". Supprimez-le avant de creer un nouveau.`,
      }, { status: 400 })
    }
    return Response.json({ success: false, error: 'Vous appartenez deja a un groupe' }, { status: 400 })
  }

  const { data: org, error } = await db
    .from('organizations')
    .insert({ name: name.trim(), owner_id: userId })
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  await ensureSubscriptionRow(db, org.id)

  const { data: { user } } = await db.auth.admin.getUserById(userId)
  const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).maybeSingle()

  await db.from('organization_members').insert({
    organization_id: org.id,
    user_id: userId,
    role: 'owner',
    display_name: profile?.full_name ?? user?.user_metadata?.full_name ?? user?.email,
    email: user?.email ?? null,
    color: '#3b7ef6',
  })

  const token = await createOrganizationInvite(db, org.id, userId)
  const payload = await getOrganizationPayloadForUser(userId)

  return Response.json({
    success: true,
    data: {
      ...payload,
      invite_link: buildInviteLink(token),
    },
  }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { action, member_id, tender_id, assigned_to, organization_id, delete_all } = await req.json()
  const db = createAdminClient()

  if (action === 'regenerate_invite') {
    const { data: org } = await db.from('organizations').select('id').eq('owner_id', userId).maybeSingle()
    if (!org) return Response.json({ success: false, error: 'Groupe introuvable' }, { status: 404 })

    const token = await createOrganizationInvite(db, org.id, userId)
    return Response.json({ success: true, data: { invite_link: buildInviteLink(token) } })
  }

  if (action === 'remove') {
    const { data: org } = await db.from('organizations').select('id').eq('owner_id', userId).maybeSingle()
    if (!org) return Response.json({ success: false, error: 'Action reservee au createur' }, { status: 403 })

    await db.from('organization_members').delete().eq('id', member_id).eq('organization_id', org.id)
    return Response.json({ success: true, data: { removed: true } })
  }

  if (action === 'assign') {
    const scope = await getTenderAccessScope(userId)
    if (!canAssignTender(scope)) {
      return Response.json({ success: false, error: 'Assignation reservee au createur' }, { status: 403 })
    }
    if (!tender_id) {
      return Response.json({ success: false, error: 'tender_id requis' }, { status: 400 })
    }

    const { data: tender } = await db
      .from('tenders')
      .select('id, user_id, title')
      .eq('id', tender_id)
      .maybeSingle()

    if (!tender || !canViewTender(scope, tender)) {
      return Response.json({ success: false, error: 'AO introuvable' }, { status: 404 })
    }

    const assignee = assigned_to || null
    if (assignee && !scope.members.some(m => m.user_id === assignee)) {
      return Response.json({ success: false, error: 'Membre invalide' }, { status: 400 })
    }

    await db.from('tenders').update({ assigned_to: assignee }).eq('id', tender_id)

    if (assignee && assignee !== userId) {
      await db.from('notifications').insert({
        user_id: assignee,
        type: 'assignment',
        title: 'AO vous a ete assigne',
        message: `Le createur vous a assigne l'AO "${tender.title}"`,
        tender_id: tender_id,
        is_read: false,
      })
    }

    return Response.json({ success: true, data: { assigned: true, assigned_to: assignee } })
  }

  if (action === 'leave') {
    const result = await leaveOrganizationAsMember(userId)
    if (!result.ok) return Response.json({ success: false, error: result.error }, { status: 400 })
    return Response.json({ success: true, data: { left: true } })
  }

  if (action === 'delete_group') {
    const result = await deleteOrganizationForOwner(userId, {
      organizationId: organization_id as string | undefined,
      deleteAll: delete_all === true,
    })
    if (!result.ok) return Response.json({ success: false, error: result.error }, { status: 400 })
    return Response.json({
      success: true,
      data: { deleted: true, name: result.name, deleted_count: result.deleted_count },
    })
  }

  return Response.json({ success: false, error: 'Action inconnue' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const organizationId = body?.organization_id as string | undefined
  const deleteAll = body?.delete_all === true

  const result = await deleteOrganizationForOwner(userId, { organizationId, deleteAll })
  if (!result.ok) return Response.json({ success: false, error: result.error }, { status: 400 })

  return Response.json({
    success: true,
    data: { deleted: true, name: result.name, deleted_count: result.deleted_count },
  })
}
