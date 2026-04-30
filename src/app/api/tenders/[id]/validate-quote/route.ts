import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const { quote_id, supplier_ids_to_notify } = await req.json()

  if (!quote_id) return Response.json({ success: false, error: 'quote_id requis' }, { status: 400 })

  const db = createAdminClient()

  // Mark quote as selected
  const { data: quote, error } = await db
    .from('quotes')
    .update({ is_selected: true, validated_at: new Date().toISOString(), validated_by: userId })
    .eq('id', quote_id)
    .select('*, supplier:suppliers(*)')
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  // Update tender status to won
  await db.from('tenders').update({ status: 'gagne' }).eq('id', id)

  return Response.json({ success: true, data: { quote, supplier_ids_to_notify } })
}
