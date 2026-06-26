export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { EMAIL_LIST_FIELDS_STANDARD, isMissingDbColumnError } from '@/lib/mail-api'

const DELTA_FIELDS = `${EMAIL_LIST_FIELDS_STANDARD}, body_html, body_text, updated_at`
const DELTA_FIELDS_FALLBACK = `${EMAIL_LIST_FIELDS_STANDARD}, body_html, body_text, created_at`
const DELTA_LIMIT = 1000

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const since = new URL(req.url).searchParams.get('since') ?? '1970-01-01T00:00:00Z'
  const supabase = createAdminClient()

  let useUpdatedAt = true
  const primary = await supabase
    .from('emails')
    .select(DELTA_FIELDS)
    .eq('user_id', userId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(DELTA_LIMIT)

  let rows: Record<string, unknown>[] | null = primary.data as Record<string, unknown>[] | null
  let error = primary.error

  if (error && isMissingDbColumnError(error.message) && /updated_at/i.test(error.message)) {
    useUpdatedAt = false
    const retry = await supabase
      .from('emails')
      .select(DELTA_FIELDS_FALLBACK)
      .eq('user_id', userId)
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(DELTA_LIMIT)
    rows = retry.data as Record<string, unknown>[] | null
    error = retry.error
  }

  if (error) {
    return Response.json({ rows: [], newCursor: since, error: error.message }, { status: 500 })
  }

  const list = rows ?? []
  const cursorField = useUpdatedAt ? 'updated_at' : 'created_at'
  const last = list.length ? list[list.length - 1] as Record<string, string> : null
  const newCursor = last?.[cursorField] ?? since

  return Response.json({ rows: list, newCursor })
}
