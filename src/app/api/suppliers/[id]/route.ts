export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const body = await req.json()
  const { name, email, additional_emails, phone, specialty, country, language, notes } = body

  const db = createAdminClient()

  const { data, error } = await db
    .from('suppliers')
    .update({ name, email, additional_emails, phone, specialty, country, language, notes })
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

  // .select() sur le delete pour savoir si une ligne a réellement été supprimée — sans ça,
  // un id d'un autre client (ou inexistant) renvoyait quand même success:true sans rien
  // supprimer, sans aucun moyen pour le client de le savoir (trouvé lors du crash test).
  const { data, error } = await db
    .from('suppliers')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return Response.json({ success: false, error: 'Fournisseur introuvable' }, { status: 404 })
  }
  return Response.json({ success: true, data: { deleted: true } })
}
