import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()

  // Get organization where user is owner or member
  const { data: org } = await db
    .from('organizations')
    .select('*, organization_members(*)')
    .eq('owner_id', userId)
    .single()

  if (!org) {
    // Check if member of another org
    const { data: membership } = await db
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('user_id', userId)
      .single()

    if (membership) {
      return Response.json({ success: true, data: { ...membership.organizations, members: [] } })
    }
    return Response.json({ success: true, data: null })
  }

  return Response.json({ success: true, data: org })
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { name } = await req.json()
  const db = createAdminClient()

  // Create organization
  const { data: org, error } = await db
    .from('organizations')
    .insert({ name, owner_id: userId })
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  // Add owner as admin member
  await db.from('organization_members').insert({
    organization_id: org.id,
    user_id: userId,
    role: 'admin',
  })

  return Response.json({ success: true, data: org }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { action, email, display_name, color, member_id, tender_id, assigned_to } = await req.json()
  const db = createAdminClient()

if (action === 'invite') {
  // Chercher dans auth.users via admin
  const { data: { users }, error: usersError } = await db.auth.admin.listUsers()
  
  const targetUser = users?.find(u => u.email === email)
  if (!targetUser) return Response.json({ success: false, error: 'Utilisateur non trouve. Il doit dabord creer un compte Operis.' }, { status: 404 })

  const { data: org } = await db.from('organizations').select('id').eq('owner_id', userId).single()
  if (!org) return Response.json({ success: false, error: 'Organisation introuvable' }, { status: 404 })

  const { error } = await db.from('organization_members').insert({
    organization_id: org.id,
    user_id: targetUser.id,
    role: 'member',
    display_name: display_name || email,
    email,
    color: color || '#3b7ef6',
  })

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data: { invited: true } })
}

  if (action === 'remove') {
    await db.from('organization_members').delete().eq('id', member_id)
    return Response.json({ success: true, data: { removed: true } })
  }

  if (action === 'assign') {
    await db.from('tenders').update({ assigned_to }).eq('id', tender_id).eq('user_id', userId)
    return Response.json({ success: true, data: { assigned: true } })
  }

  return Response.json({ success: false, error: 'Action inconnue' }, { status: 400 })
}
