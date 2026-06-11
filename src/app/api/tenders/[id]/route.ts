export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { collectTenderDocuments } from '@/lib/tender-documents'
import { isValidUuid, rejectUnexpectedFields, validateTitle, badRequest } from '@/lib/api-validation'
import {
  canAssignTender,
  getTenderIfAccessible,
} from '@/lib/tender-access'

export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  if (!isValidUuid(id)) return badRequest('ID AO invalide')

  const access = await getTenderIfAccessible(id, userId, 'view')
  if (!access) {
    return Response.json({ success: false, error: 'AO introuvable' }, { status: 404 })
  }

  const tender = access.tender
  const db = createAdminClient()

  const { data: consultations } = await db
    .from('consultation_suppliers')
    .select('*, supplier:suppliers(*)')
    .eq('tender_id', id)

  const { data: quotes } = await db
    .from('quotes')
    .select('*, supplier:suppliers(*)')
    .eq('tender_id', id)
    .order('price_ht', { ascending: true })

  const { data: stats } = await db
    .from('tender_stats')
    .select('*')
    .eq('tender_id', id)
    .single()

  const documents = await collectTenderDocuments(
    db, tender.user_id as string, id, consultations ?? [], quotes ?? []
  )

  return Response.json({
    success: true,
    data: {
      ...tender,
      consultations: consultations ?? [],
      quotes: quotes ?? [],
      documents,
      stats,
      access: {
        is_org_owner: access.scope.isOrgOwner,
        can_delete: access.scope.isOrgOwner && access.scope.organizationId !== null
          || !access.scope.organizationId && tender.user_id === userId,
        can_assign: canAssignTender(access.scope),
      },
    },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  if (!isValidUuid(id)) return badRequest('ID AO invalide')

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return badRequest('Corps JSON requis')

  const allowed = [
    'title', 'client', 'description', 'deadline', 'status',
    'budget_ht', 'zone_geo', 'maitre_ouvrage', 'notes_internes',
    'priorite', 'assigned_to',
  ]
  const fieldErr = rejectUnexpectedFields(body as Record<string, unknown>, allowed)
  if (fieldErr) return badRequest(fieldErr)
  if ('title' in body) {
    const titleErr = validateTitle(body.title)
    if (titleErr) return badRequest(titleErr)
  }

  const access = await getTenderIfAccessible(id, userId, 'mutate')
  if (!access) {
    return Response.json({ success: false, error: 'AO introuvable' }, { status: 404 })
  }

  const payload: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) payload[key] = body[key]
  }

  if ('assigned_to' in payload && !canAssignTender(access.scope)) {
    delete payload.assigned_to
  }

  const db = createAdminClient()
  const { data, error } = await db
    .from('tenders')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  if (!isValidUuid(id)) return badRequest('ID AO invalide')

  const access = await getTenderIfAccessible(id, userId, 'delete')
  if (!access) {
    return Response.json({
      success: false,
      error: 'Suppression reservee au createur du groupe',
    }, { status: 403 })
  }

  const db = createAdminClient()
  const { error } = await db.from('tenders').delete().eq('id', id)

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data: { deleted: true } })
}
