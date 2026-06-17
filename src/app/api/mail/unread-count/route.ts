export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { isMissingDbColumnError } from '@/lib/mail-api'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()

  let query = db
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .or('mail_folder.eq.inbox,mail_folder.is.null')
    .eq('is_read', false)

  let { count, error } = await query

  if (error && isMissingDbColumnError(error.message) && /deleted_at/i.test(error.message)) {
    const retry = await db
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or('mail_folder.eq.inbox,mail_folder.is.null')
      .eq('is_read', false)
    count = retry.count
    error = retry.error
  }

  if (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 })
  }

  return Response.json({ success: true, data: { count: count ?? 0 } })
}
