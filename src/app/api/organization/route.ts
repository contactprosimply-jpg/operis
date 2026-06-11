export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  buildInviteLink,
  createOrganizationInvite,
  getOrganizationPayloadForUser,
  userBelongsToOrganization,
} from '@/lib/organization'

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
    return Response.json({ success: false, error: 'Vous appartenez deja a un groupe' }, { status: 400 })
  }

  const { data: org, error } = await db
    .from('organizations')
    .insert({ name: name.trim(), owner_id: userId })
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

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

  const { action, member_id, tender_id, assigned_to } = await req.json()
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
    await db.from('tenders').update({ assigned_to }).eq('id', tender_id).eq('user_id', userId)
    return Response.json({ success: true, data: { assigned: true } })
  }

  return Response.json({ success: false, error: 'Action inconnue' }, { status: 400 })
}
