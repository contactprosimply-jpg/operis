export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { isValidUuid } from '@/lib/api-validation'
import { deliverPendingMail } from '@/lib/mail-human-verification'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!isValidUuid(token)) {
    return Response.json({ success: false, error: 'Lien invalide' }, { status: 404 })
  }

  const db = createAdminClient()
  const result = await deliverPendingMail(db, token)
  if (!result.success) return Response.json(result, { status: 400 })
  return Response.json(result)
}
