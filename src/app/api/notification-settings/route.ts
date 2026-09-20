export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getNotificationSettings, saveNotificationSettings } from '@/lib/notification-settings'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()
  const settings = await getNotificationSettings(createAdminClient(), userId)
  return Response.json({ success: true, data: settings })
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return Response.json({ success: false, error: 'Corps JSON requis' }, { status: 400 })
  }

  const patch: { digest_enabled?: boolean; digest_hour?: number } = {}
  if (body.digest_enabled !== undefined) {
    if (typeof body.digest_enabled !== 'boolean') {
      return Response.json({ success: false, error: 'digest_enabled doit être un booléen' }, { status: 400 })
    }
    patch.digest_enabled = body.digest_enabled
  }
  if (body.digest_hour !== undefined) {
    const h = body.digest_hour
    if (typeof h !== 'number' || !Number.isInteger(h) || h < 0 || h > 23) {
      return Response.json({ success: false, error: 'digest_hour doit être un entier entre 0 et 23' }, { status: 400 })
    }
    patch.digest_hour = h
  }
  if (!Object.keys(patch).length) {
    return Response.json({ success: false, error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  const result = await saveNotificationSettings(createAdminClient(), userId, patch)
  if (!result.persisted) {
    return Response.json({ success: false, error: result.error ?? 'Enregistrement impossible', data: result.settings }, { status: 503 })
  }
  return Response.json({ success: true, data: result.settings })
}
