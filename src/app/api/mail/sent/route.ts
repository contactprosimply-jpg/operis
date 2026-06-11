export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 100), 200)

  const { data, error } = await db
    .from('email_logs')
    .select('id, type, to_address, subject, body, sent_at, success, tender_id, supplier_id')
    .eq('user_id', userId)
    .eq('success', true)
    .order('sent_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (/column .*user_id.* does not exist/i.test(error.message)) {
      return Response.json({ success: true, data: [] })
    }
    return Response.json({ success: false, error: error.message }, { status: 500 })
  }

  return Response.json({ success: true, data: data ?? [] })
}
