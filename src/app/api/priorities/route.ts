export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { collectPriorityItems, setEmailHandled } from '@/lib/priorities'
import { isValidUuid } from '@/lib/api-validation'
import type { PriorityPayload } from '@/lib/priorities-rules'

// Le panneau interroge cette route en boucle : petit cache par utilisateur pour ne pas refaire
// toutes les requêtes à chaque appel. Vidé dès qu'un élément est marqué traité.
const CACHE_TTL_MS = 30_000
const cache = new Map<string, { at: number; payload: PriorityPayload }>()

// GET /api/priorities — ce qui reste à traiter
export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Response.json({ success: true, data: hit.payload })
  }

  const payload = await collectPriorityItems(createAdminClient(), userId)
  cache.set(userId, { at: Date.now(), payload })
  return Response.json({ success: true, data: payload })
}

// POST /api/priorities — body { email_id, handled?: boolean } : marquer traité (ou annuler)
export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null) as { email_id?: unknown; handled?: unknown } | null
  if (!body || typeof body.email_id !== 'string' || !isValidUuid(body.email_id)) {
    return Response.json({ success: false, error: 'email_id invalide' }, { status: 400 })
  }
  const handled = body.handled === undefined ? true : body.handled === true

  const result = await setEmailHandled(createAdminClient(), userId, body.email_id, handled)
  if (!result.ok) {
    const status = result.error === 'Mail introuvable' ? 404 : 503
    return Response.json({ success: false, error: result.error }, { status })
  }
  cache.delete(userId)
  return Response.json({ success: true, data: { email_id: body.email_id, handled } })
}
