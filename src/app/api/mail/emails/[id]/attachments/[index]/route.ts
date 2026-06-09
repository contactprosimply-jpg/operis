export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import type { EmailAttachment } from '@/types/database'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id, index } = await params
  const idx = parseInt(index, 10)
  if (Number.isNaN(idx) || idx < 0) {
    return Response.json({ success: false, error: 'Index invalide' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: email, error } = await db
    .from('emails')
    .select('attachments')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error || !email) {
    return Response.json({ success: false, error: 'Email introuvable' }, { status: 404 })
  }

  const attachments = (email.attachments as EmailAttachment[]) ?? []
  const att = attachments[idx]
  if (!att?.data) {
    return Response.json({ success: false, error: 'Pièce jointe introuvable ou trop volumineuse' }, { status: 404 })
  }

  const buffer = Buffer.from(att.data, 'base64')
  return new Response(buffer, {
    headers: {
      'Content-Type': att.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(att.filename)}"`,
      'Content-Length': String(buffer.length),
    },
  })
}
