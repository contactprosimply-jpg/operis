export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { tenderService } from '@/services/tender.service'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { MAX_UPLOAD_BYTES, requestBodyTooLarge, tooLargeResponse } from '@/lib/upload-limits'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  // Rejette tôt, sur l'en-tête, avant tout req.json() — un corps trop gros peut être tronqué
  // par le proxy, et JSON.parse() planterait dessus.
  if (requestBodyTooLarge(req)) return tooLargeResponse()

  const { id } = await params
  const { supplier_ids, message, document_ids, subject, body, signature, cc, attachments } = await req.json()
  if (!supplier_ids?.length) {
    return Response.json({ success: false, error: 'supplier_ids requis' }, { status: 400 })
  }

  // Second contrôle, sur la taille décodée estimée du total des pièces jointes — cas où
  // Content-Length est absent/faux. Estimation depuis la longueur base64 (évite d'allouer
  // les buffers ici — le décodage réel a lieu plus loin, dans tenderService.sendConsultation).
  if (Array.isArray(attachments)) {
    const totalBytes = attachments.reduce((sum: number, a: { data?: string }) => (
      sum + (typeof a?.data === 'string' ? Math.floor(a.data.length * 0.75) : 0)
    ), 0)
    if (totalBytes > MAX_UPLOAD_BYTES) return tooLargeResponse()
  }
  const result = await tenderService.sendConsultation(id, userId, supplier_ids, {
    message,
    document_ids,
    subject,
    body,
    signature,
    cc,
    attachment_files: attachments,
  })
  return Response.json(result, { status: result.success ? 200 : 400 })
}
