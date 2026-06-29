export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createDevisSignedUrl } from '@/lib/devis-storage'
import { createMailAttachmentSignedUrl } from '@/lib/mail-storage'
import { normalizeAttachments } from '@/lib/mail-attachments'
import { assertTenderAccess } from '@/lib/tender-access'
import { isPreviewableDocument } from '@/lib/tender-document-preview'

const SIGNED_URL_TTL_SEC = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id, docId } = await params
  const modeParam = new URL(req.url).searchParams.get('mode')
  const mode = modeParam === 'download' ? 'download' : 'open'
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

    const signedMode = mode === 'download' || !isPreviewableDocument(att.filename, att.contentType)
      ? 'download'
      : 'inline'

    if (att.path) {
      const url = await createMailAttachmentSignedUrl(db, att.path, att.filename, signedMode, SIGNED_URL_TTL_SEC)
      if (url) return Response.json({ success: true, data: { url, mode: signedMode } })
    }

    return Response.json({
      success: true,
      data: {
        stream: true,
        mode: signedMode,
        path: `/api/tenders/${id}/documents/${encodeURIComponent(docId)}?disposition=${signedMode === 'download' ? 'attachment' : 'inline'}`,
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

    const signedMode = mode === 'download' || !isPreviewableDocument(att.filename, att.contentType)
      ? 'download'
      : 'inline'
    const url = await createDevisSignedUrl(db, att.path, att.filename, signedMode, SIGNED_URL_TTL_SEC)
    if (!url) return Response.json({ success: false, error: 'URL indisponible' }, { status: 500 })
    return Response.json({ success: true, data: { url, mode: signedMode } })
  }

  const { data: doc } = await db
    .from('tender_documents')
    .select('filename, content_type, storage_path')
    .eq('id', docId)
    .eq('tender_id', id)
    .eq('user_id', ownerId)
    .is('deleted_at', null)
    .single()

  if (!doc?.storage_path) return Response.json({ success: false, error: 'Fichier introuvable' }, { status: 404 })

  const signedMode = mode === 'download' || !isPreviewableDocument(doc.filename, doc.content_type)
    ? 'download'
    : 'inline'
  const url = await createDevisSignedUrl(db, doc.storage_path, doc.filename, signedMode, SIGNED_URL_TTL_SEC)
  if (!url) return Response.json({ success: false, error: 'URL indisponible' }, { status: 500 })

  return Response.json({ success: true, data: { url, mode: signedMode } })
}
