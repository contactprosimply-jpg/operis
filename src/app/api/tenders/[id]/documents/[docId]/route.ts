export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { downloadDevisFile } from '@/lib/devis-storage'
import { downloadAttachmentBuffer } from '@/lib/mail-storage'
import { normalizeAttachments } from '@/lib/mail-attachments'
import { assertTenderAccess } from '@/lib/tender-access'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id, docId } = await params
  const db = createAdminClient()

  const access = await assertTenderAccess(db, id, userId, 'view')
  if (!access.ok) return Response.json({ success: false, error: access.error }, { status: access.status })
  const ownerId = access.tender.user_id

  if (docId.startsWith('mail:')) {
    const [, emailId, indexStr] = docId.split(':')
    const index = parseInt(indexStr, 10)
    const { data: email } = await db.from('emails').select('attachments').eq('id', emailId).eq('user_id', ownerId).single()
    if (!email) return Response.json({ success: false, error: 'Fichier introuvable' }, { status: 404 })
    const attachments = normalizeAttachments(email.attachments)
    const att = attachments[index]
    if (!att) return Response.json({ success: false, error: 'Fichier introuvable' }, { status: 404 })
    const buffer = await downloadAttachmentBuffer(db, att)
    if (!buffer?.length) return Response.json({ success: false, error: 'Fichier introuvable' }, { status: 404 })
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': att.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(att.filename)}"`,
      },
    })
  }

  if (docId.startsWith('log:')) {
    const [, logId, indexStr] = docId.split(':')
    const index = parseInt(indexStr, 10)
    const { data: log } = await db.from('email_logs').select('attachments').eq('id', logId).eq('tender_id', id).single()
    if (!log) return Response.json({ success: false, error: 'Fichier introuvable' }, { status: 404 })
    const attachments = normalizeAttachments(log.attachments)
    const att = attachments[index]
    if (!att?.path) return Response.json({ success: false, error: 'Fichier introuvable' }, { status: 404 })
    const buffer = await downloadDevisFile(db, att.path)
    if (!buffer?.length) return Response.json({ success: false, error: 'Fichier introuvable' }, { status: 404 })
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': att.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(att.filename)}"`,
      },
    })
  }

  const { data: doc } = await db
    .from('tender_documents')
    .select('*')
    .eq('id', docId)
    .eq('tender_id', id)
    .eq('user_id', ownerId)
    .single()

  if (!doc) return Response.json({ success: false, error: 'Fichier introuvable' }, { status: 404 })

  const buffer = await downloadDevisFile(db, doc.storage_path)
  if (!buffer?.length) return Response.json({ success: false, error: 'Fichier introuvable' }, { status: 404 })

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': doc.content_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.filename)}"`,
    },
  })
}
