export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { assertTenderAccess } from '@/lib/tender-access'
import {
  excludeMailAttachmentFromTender,
  includeMailAttachmentInTender,
} from '@/lib/tender-documents'
import { badRequest, isValidUuid } from '@/lib/api-validation'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  if (!isValidUuid(id)) return badRequest('ID AO invalide')

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return badRequest('Corps JSON requis')

  const action = body.action as string
  const emailId = body.email_id as string
  const attachmentIndex = body.attachment_index

  if (action !== 'include' && action !== 'exclude') {
    return badRequest('action doit être include ou exclude')
  }
  if (!isValidUuid(emailId)) return badRequest('email_id invalide')
  if (typeof attachmentIndex !== 'number' || attachmentIndex < 0 || !Number.isInteger(attachmentIndex)) {
    return badRequest('attachment_index invalide')
  }

  const db = createAdminClient()
  const access = await assertTenderAccess(db, id, userId, 'mutate')
  if (!access.ok) {
    return Response.json({ success: false, error: access.error }, { status: access.status })
  }
  const ownerId = access.tender.user_id

  try {
    if (action === 'include') {
      await includeMailAttachmentInTender(db, ownerId, id, emailId, attachmentIndex)
    } else {
      await excludeMailAttachmentFromTender(db, ownerId, id, emailId, attachmentIndex)
    }
    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur'
    return Response.json({ success: false, error: message }, { status: 400 })
  }
}
