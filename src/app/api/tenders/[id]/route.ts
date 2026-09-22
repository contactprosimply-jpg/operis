export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { isValidUuid, rejectUnexpectedFields, validateTitle, badRequest } from '@/lib/api-validation'
import {
  canAssignTender,
  getTenderIfAccessible,
} from '@/lib/tender-access'
// L'assignation (assigned_to) ne passe PAS par cette route : voir
// POST /api/organization { action: 'assign' }, qui valide que la cible est
// bien un membre de l'organisation de l'appelant et trace assigned_by/assigned_at.
// Un simple "l'appelant est le créateur du groupe" (canAssignTender) ne suffit
// pas à autoriser l'écriture ici, car ça n'empêche pas d'assigner à un user_id
// arbitraire hors organisation.
import { buildTenderMemberLabels } from '@/lib/tender-enrich'

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
    .maybeSingle()

  const { data: corpsEtatsRows } = await db
    .from('tender_corps_etats')
    .select('corps_etat_id')
    .eq('tender_id', id)
  const corpsEtats = (corpsEtatsRows ?? []).map(r => r.corps_etat_id)

  const ownerId = tender.user_id as string
  const [{ count: documentCount }, { count: linkedEmailCount }] = await Promise.all([
    db.from('tender_documents')
      .select('id', { count: 'exact', head: true })
      .eq('tender_id', id)
      .eq('user_id', ownerId)
      .is('deleted_at', null),
    db.from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('tender_id', id)
      .eq('user_id', ownerId),
  ])

  const memberLabels = buildTenderMemberLabels(tender, access.scope)
  if (!memberLabels.creator_label && tender.user_id && tender.user_id !== userId) {
    const { data: { user: creator } } = await db.auth.admin.getUserById(tender.user_id)
    if (creator?.email) memberLabels.creator_label = creator.email.split('@')[0]
  }

  return Response.json({
    success: true,
    data: {
      ...tender,
      ...memberLabels,
      corps_etats: corpsEtats,
      consultations: consultations ?? [],
      quotes: quotes ?? [],
      documents: { received: [], sent: [], optional_png: [], document_groups: [] },
      meta: {
        document_count: documentCount ?? 0,
        linked_email_count: linkedEmailCount ?? 0,
      },
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
    'priorite', 'dossier_url', 'is_own_client', 'corps_etats',
  ]
  const fieldErr = rejectUnexpectedFields(body as Record<string, unknown>, allowed)
  if (fieldErr) return badRequest(fieldErr)
  if ('title' in body) {
    const titleErr = validateTitle(body.title)
    if (titleErr) return badRequest(titleErr)
  }
  if ('corps_etats' in body && (!Array.isArray(body.corps_etats) || !body.corps_etats.every((v: unknown) => typeof v === 'string'))) {
    return badRequest('corps_etats doit être un tableau de chaînes')
  }

  const access = await getTenderIfAccessible(id, userId, 'mutate')
  if (!access) {
    return Response.json({ success: false, error: 'AO introuvable' }, { status: 404 })
  }

  const { corps_etats, ...bodyRest } = body as Record<string, unknown> & { corps_etats?: string[] }
  const payload: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key === 'corps_etats') continue
    if (key in bodyRest) payload[key] = bodyRest[key]
  }

  const db = createAdminClient()

  let data: unknown = null
  if (Object.keys(payload).length > 0) {
    const { data: updated, error } = await db
      .from('tenders')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
    data = updated
  } else {
    const { data: existing, error } = await db.from('tenders').select('*').eq('id', id).single()
    if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
    data = existing
  }

  let updatedCorpsEtats: string[] | undefined
  if (corps_etats !== undefined) {
    const { error: delErr } = await db.from('tender_corps_etats').delete().eq('tender_id', id)
    if (delErr) return Response.json({ success: false, error: delErr.message }, { status: 500 })
    if (corps_etats.length > 0) {
      const { error: insErr } = await db
        .from('tender_corps_etats')
        .insert(corps_etats.map(corps_etat_id => ({ tender_id: id, corps_etat_id })))
      if (insErr) return Response.json({ success: false, error: insErr.message }, { status: 400 })
    }
    updatedCorpsEtats = corps_etats
  }

  return Response.json({ success: true, data: { ...(data as object), ...(updatedCorpsEtats ? { corps_etats: updatedCorpsEtats } : {}) } })
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
      error: 'Suppression réservée au créateur du groupe',
    }, { status: 403 })
  }

  const db = createAdminClient()
  const { error } = await db.from('tenders').delete().eq('id', id)

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data: { deleted: true } })
}
