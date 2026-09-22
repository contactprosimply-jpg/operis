export const dynamic = 'force-dynamic'

// ============================================================
// OPERIS — app/api/corps-etats/route.ts
// GET → nomenclature des corps d'état (table de référence globale)
// ============================================================

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const { data, error } = await db
    .from('corps_etats')
    .select('id, label, sort_order')
    .eq('is_active', true)
    .order('sort_order')

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}
