export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  DEFAULT_USER_SETTINGS,
  getUserSettings,
  upsertUserSettings,
  type UserSettings,
} from '@/lib/user-settings'

const PATCH_KEYS: Array<keyof UserSettings> = [
  'relance_first_delay_days',
  'relance_interval_days',
  'relance_max_count',
  'relance_working_days_only',
  'relance_confirm_before_send',
  'auto_labels_enabled',
  'label_a_traiter_delay_hours',
  'label_en_retard_delay_days',
  'mail_signature',
  'mail_signature_enabled',
]

function parsePatch(body: Record<string, unknown>): Partial<UserSettings> {
  const patch: Partial<UserSettings> = {}

  for (const key of PATCH_KEYS) {
    if (body[key] === undefined) continue
    if (key === 'mail_signature') {
      patch.mail_signature = typeof body[key] === 'string' ? body[key].slice(0, 20000) : ''
      continue
    }
    if (typeof body[key] === 'boolean') {
      (patch as Record<string, boolean>)[key] = body[key] as boolean
      continue
    }
    if (typeof body[key] === 'number' && Number.isFinite(body[key])) {
      (patch as Record<string, number>)[key] = body[key] as number
    }
  }

  return patch
}

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const settings = await getUserSettings(db, userId)
  return Response.json({ success: true, data: settings })
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return Response.json({ success: false, error: 'Corps JSON requis' }, { status: 400 })
  }

  const patch = parsePatch(body)
  if (!Object.keys(patch).length) {
    return Response.json({ success: false, error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  const db = createAdminClient()
  try {
    const result = await upsertUserSettings(db, userId, patch)
    return Response.json({
      success: true,
      data: result.settings,
      persisted: result.persisted,
      warning: result.warning,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erreur sauvegarde'
    console.error('[user-settings] PATCH:', message)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return Response.json({ success: false, error: 'Corps JSON requis' }, { status: 400 })
  }

  const patch: Partial<UserSettings> = { ...DEFAULT_USER_SETTINGS }
  for (const key of PATCH_KEYS) {
    if (body[key] === undefined) continue
    if (key === 'mail_signature') {
      patch.mail_signature = typeof body[key] === 'string' ? body[key].slice(0, 20000) : ''
    } else if (typeof body[key] === 'boolean') {
      (patch as Record<string, boolean>)[key] = body[key] as boolean
    } else if (typeof body[key] === 'number') {
      (patch as Record<string, number>)[key] = body[key] as number
    }
  }

  const db = createAdminClient()
  try {
    const result = await upsertUserSettings(db, userId, patch)
    return Response.json({
      success: true,
      data: result.settings,
      persisted: result.persisted,
      warning: result.warning,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erreur sauvegarde'
    console.error('[user-settings] PUT:', message)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
