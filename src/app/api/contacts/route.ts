export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { clampString } from '@/lib/api-validation'
import { parseFromAddress } from '@/lib/contacts'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const tenderId = new URL(req.url).searchParams.get('tender_id')?.trim() || undefined
  const db = createAdminClient()

  let q = db
    .from('contacts')
    .select('id, email, name, company, is_favorite, ao_ids, email_count, last_contacted_at')
    .eq('user_id', userId)
    .order('is_favorite', { ascending: false })
    .order('last_contacted_at', { ascending: false, nullsFirst: false })

  if (tenderId) {
    q = q.contains('ao_ids', [tenderId])
  }

  const { data, error } = await q.limit(2000)
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()

  if (body.all_favorites === true) {
    const db = createAdminClient()
    const { error, count } = await db
      .from('contacts')
      .update({ is_favorite: true })
      .eq('user_id', userId)
      .eq('is_favorite', false)
      .select('id', { count: 'exact', head: true })

    if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
    return Response.json({ success: true, updated: count ?? 0 })
  }

  const email = clampString(body.email, 320)?.toLowerCase().trim()
  if (!email) {
    return Response.json({ success: false, error: 'email requis' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.is_favorite !== undefined) patch.is_favorite = Boolean(body.is_favorite)
  if (body.name !== undefined) patch.name = clampString(body.name, 200) ?? null
  if (body.company !== undefined) patch.company = clampString(body.company, 200) ?? null

  if (!Object.keys(patch).length) {
    return Response.json({ success: false, error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data, error } = await db
    .from('contacts')
    .update(patch)
    .eq('user_id', userId)
    .eq('email', email)
    .select('id, email, name, company, is_favorite, ao_ids, email_count, last_contacted_at')
    .maybeSingle()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  if (!data) {
    const fromRaw = clampString(body.from_address, 500)
    const parsed = fromRaw ? parseFromAddress(fromRaw) : { email, name: null }
    const { data: inserted, error: insertError } = await db
      .from('contacts')
      .insert({
        user_id: userId,
        email,
        name: parsed.name,
        is_favorite: patch.is_favorite ?? false,
        company: patch.company ?? null,
      })
      .select('id, email, name, company, is_favorite, ao_ids, email_count, last_contacted_at')
      .single()
    if (insertError) return Response.json({ success: false, error: insertError.message }, { status: 500 })
    return Response.json({ success: true, data: inserted })
  }

  return Response.json({ success: true, data })
}
