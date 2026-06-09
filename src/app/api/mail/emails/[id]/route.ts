export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import type { EmailAttachment } from '@/types/database'

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

  const rawAttachments = (email.attachments as EmailAttachment[]) ?? []
  const attachments = rawAttachments.map(({ filename, contentType, size, data }) => ({
    filename,
    contentType,
    size,
    hasData: !!data,
  }))

  return Response.json({
    success: true,
    data: {
      ...email,
      attachments,
    },
  })
}
