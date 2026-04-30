export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const db = createAdminClient()

  const { data: tender, error } = await db
    .from('tenders')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error || !tender) {
    return Response.json({ success: false, error: 'AO introuvable' }, { status: 404 })
  }

  const { data: consultations } = await db
    .from('consultation_suppliers')
    .select('*, supplier:suppliers(*)')
    .eq('tender_id', id)

  const { data: quotes } = await db
    .from('quotes')
    .select('*, supplier:suppliers(*)')
    .eq('tender_id', id)
    .order('price_ht', { ascending: true })

  const { data: stats } = await db
    .from('tender_stats')
    .select('*')
    .eq('tender_id', id)
    .single()

  return Response.json({
    success: true,
    data: {
      ...tender,
      consultations: consultations ?? [],
      quotes: quotes ?? [],
      stats,
    }
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const body = await req.json()
  const db = createAdminClient()

  const allowed = [
    'title', 'client', 'description', 'deadline', 'status',
    'budget_ht', 'zone_geo', 'maitre_ouvrage', 'notes_internes',
    'priorite', 'assigned_to',
  ]

  const payload: Record<string, any> = {}
  for (const key of allowed) {
    if (key in body) payload[key] = body[key]
  }

  const { data, error } = await db
    .from('tenders')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const db = createAdminClient()

  const { error } = await db
    .from('tenders')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data: { deleted: true } })
}
