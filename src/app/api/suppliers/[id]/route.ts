// ============================================================
// OPERIS — app/api/suppliers/[id]/route.ts
// DELETE /api/suppliers/:id
// ============================================================

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

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
