export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { collectTenderDocuments, type QuoteRow } from '@/lib/tender-documents'
import { uploadTenderDocument, DEVIS_BUCKET } from '@/lib/devis-storage'
import { assertTenderAccess } from '@/lib/tender-access'
import { assertStorageQuota } from '@/lib/billing/subscription'

// Fichier brut max accepté — un DCE/plan BTP de 15-20 Mo est un usage normal, pas un abus
// (voir experimental.proxyClientMaxBodySize dans next.config.ts, relevé en conséquence).
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024
// Le corps JSON (base64) est ~33% plus gros que le fichier brut, + une petite marge pour
// filename/contentType. Rejeter tôt sur Content-Length évite de tenter un JSON.parse() sur
// un corps tronqué par le proxy si jamais la taille dépasse la limite configurée là-bas.
const MAX_JSON_BODY_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 1.35) + 4096

function tooLargeResponse() {
  return Response.json({
    success: false,
    error: `Fichier trop volumineux (maximum ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} Mo)`,
  }, { status: 413 })
}

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

  // Rejette tôt, sur l'en-tête, avant tout req.json() — un corps trop gros peut être tronqué
  // par le proxy (voir MAX_JSON_BODY_BYTES ci-dessus), et JSON.parse() planterait dessus.
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_JSON_BODY_BYTES) return tooLargeResponse()

  const { id } = await params
  const { filename, contentType, data, source } = await req.json().catch(() => ({}) as Record<string, unknown>)

  if (!filename || !data) {
    return Response.json({ success: false, error: 'filename et data requis' }, { status: 400 })
  }

  const db = createAdminClient()
  const access = await assertTenderAccess(db, id, userId, 'mutate')
  if (!access.ok) return Response.json({ success: false, error: access.error }, { status: access.status })
  const ownerId = access.tender.user_id

  const docId = crypto.randomUUID()
  const buffer = Buffer.from(data, 'base64')

  // Second contrôle, sur la taille réelle décodée — cas où Content-Length est absent/faux.
  if (buffer.length > MAX_UPLOAD_BYTES) return tooLargeResponse()

  const quota = await assertStorageQuota(db, userId, buffer.length)
  if (!quota.ok) {
    return Response.json({ success: false, error: quota.error, code: 'STORAGE_QUOTA' }, { status: 403 })
  }

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
    source: source || 'manual_import',
    // Traçabilité : userId = l'auteur réel de l'upload (peut différer du propriétaire de
    // l'AO dans un contexte multi-membres), pas ownerId.
    imported_by: userId,
  }).select('id, filename, content_type, size, created_at').single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data: row })
}
