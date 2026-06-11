export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { collectTenderDocuments, type QuoteRow } from '@/lib/tender-documents'
import { uploadTenderDocument, DEVIS_BUCKET } from '@/lib/devis-storage'
import { assertTenderAccess } from '@/lib/tender-access'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const db = createAdminClient()

  const access = await assertTenderAccess(db, id, userId, 'view')
  if (!access.ok) return Response.json({ success: false, error: access.error }, { status: access.status })
  const ownerId = access.tender.user_id

  const { data: consultations } = await db
    .from('consultation_suppliers')
    .select('*, supplier:suppliers(*)')
    .eq('tender_id', id)

  const { data: quotes } = await db
    .from('quotes')
    .select('id, supplier_id, source_email_id, supplier:suppliers(id, name)')
    .eq('tender_id', id)

  const documents = await collectTenderDocuments(
    db, ownerId, id, consultations ?? [], (quotes ?? []) as QuoteRow[],
  )
  return Response.json({ success: true, data: documents })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const { filename, contentType, data, source } = await req.json()

  if (!filename || !data) {
    return Response.json({ success: false, error: 'filename et data requis' }, { status: 400 })
  }

  const db = createAdminClient()
  const access = await assertTenderAccess(db, id, userId, 'mutate')
  if (!access.ok) return Response.json({ success: false, error: access.error }, { status: access.status })
  const ownerId = access.tender.user_id

  const docId = crypto.randomUUID()
  const buffer = Buffer.from(data, 'base64')
  const storagePath = await uploadTenderDocument(db, ownerId, id, {
    filename,
    contentType: contentType || 'application/octet-stream',
    buffer,
  }, docId)

  const { data: row, error } = await db.from('tender_documents').insert({
    tender_id: id,
    user_id: ownerId,
    filename,
    content_type: contentType || 'application/octet-stream',
    size: buffer.length,
    storage_path: storagePath,
    bucket: DEVIS_BUCKET,
    source: source || 'outbound',
  }).select('id, filename, content_type, size, created_at').single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data: row })
}
