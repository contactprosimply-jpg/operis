export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { rejectUnexpectedFields, badRequest } from '@/lib/api-validation'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, company, role, onboarding_done, tour_done, created_at')
    .eq('id', userId)
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return badRequest('Corps JSON requis')

  const fieldErr = rejectUnexpectedFields(body as Record<string, unknown>, [
    'full_name', 'company', 'onboarding_done', 'tour_done',
  ])
  if (fieldErr) return badRequest(fieldErr)

  const updates: Record<string, unknown> = {}
  if ('full_name' in body) {
    if (body.full_name !== null && typeof body.full_name !== 'string') {
      return badRequest('full_name invalide')
    }
    updates.full_name = body.full_name
  }
  if ('company' in body) {
    if (body.company !== null && typeof body.company !== 'string') {
      return badRequest('company invalide')
    }
    updates.company = body.company
  }
  if ('onboarding_done' in body) {
    if (typeof body.onboarding_done !== 'boolean') {
      return badRequest('onboarding_done doit être un booléen')
    }
    updates.onboarding_done = body.onboarding_done
  }
  if ('tour_done' in body) {
    if (typeof body.tour_done !== 'boolean') {
      return badRequest('tour_done doit être un booléen')
    }
    updates.tour_done = body.tour_done
  }

  if (Object.keys(updates).length === 0) return badRequest('Aucun champ à mettre à jour')

  const db = createAdminClient()
  const { data, error } = await db
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id, full_name, company, role, onboarding_done, tour_done, created_at')
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}
