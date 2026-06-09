export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { toAttachmentMeta } from '@/lib/mail-attachments'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const db = createAdminClient()

  const { data: email, error } = await db
    .from('emails')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error || !email) {
    return Response.json({ success: false, error: 'Email introuvable' }, { status: 404 })
  }

  const attachments = toAttachmentMeta(email.attachments)
  const hasAttachments = !!email.has_attachments || attachments.length > 0

  return Response.json({
    success: true,
    data: {
      ...email,
      has_attachments: hasAttachments,
      attachments,
      attachments_pending: hasAttachments && attachments.length === 0,
    },
  })
}
