import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const body = await req.json()
  const { name, email, phone, specialty, country, language, notes } = body

  const db = createAdminClient()

  const { data, error } = await db
    .from('suppliers')
    .update({ name, email, phone, specialty, country, language, notes })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const db = createAdminClient()

  const { error } = await db
    .from('suppliers')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data: { deleted: true } })
}
