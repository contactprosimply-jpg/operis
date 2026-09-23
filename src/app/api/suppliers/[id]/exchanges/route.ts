export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { isValidUuid, badRequest } from '@/lib/api-validation'
import { getSupplierExchanges } from '@/lib/supplier-exchanges'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  if (!isValidUuid(id)) return badRequest('ID fournisseur invalide')

  const db = createAdminClient()
  const { data: supplier } = await db
    .from('suppliers')
    .select('id, email, additional_emails')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!supplier) return Response.json({ success: false, error: 'Fournisseur introuvable' }, { status: 404 })

  try {
    return Response.json({ success: true, data: await getSupplierExchanges(db, userId, supplier) })
  } catch (e: unknown) {
    return Response.json({ success: false, error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
