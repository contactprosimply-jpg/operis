export const dynamic = 'force-dynamic'

// ============================================================
// OPERIS — app/api/quotes/route.ts
// POST /api/quotes → enregistrer un devis
// ============================================================

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { tender_id, supplier_id, price_ht, document_url, notes } = await req.json()

  if (!tender_id || !supplier_id) {
    return Response.json({ success: false, error: 'tender_id et supplier_id requis' }, { status: 400 })
  }

  const db = createAdminClient()

  // Vérifier que le tender appartient à l'utilisateur
  const { data: tender } = await db
    .from('tenders')
    .select('id')
    .eq('id', tender_id)
    .eq('user_id', userId)
    .single()

  if (!tender) return Response.json({ success: false, error: 'AO introuvable' }, { status: 404 })

  // Créer le devis
  const { data, error } = await db
    .from('quotes')
    .insert({ tender_id, supplier_id, price_ht, document_url, notes })
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  // Mettre à jour le statut consultation → répondu
  await db
    .from('consultation_suppliers')
    .update({ status: 'repondu' })
    .eq('tender_id', tender_id)
    .eq('supplier_id', supplier_id)

  return Response.json({ success: true, data }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { searchParams } = new URL(req.url)
  const tender_id = searchParams.get('tender_id')

  if (!tender_id) return Response.json({ success: false, error: 'tender_id requis' }, { status: 400 })

  const db = createAdminClient()

  const { data, error } = await db
    .from('quotes')
    .select('*, supplier:suppliers(*)')
    .eq('tender_id', tender_id)
    .order('price_ht', { ascending: true })

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}

