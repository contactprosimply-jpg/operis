export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const { data, error } = await db
    .from('mail_drafts')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(30)

  if (error) {
    if (/mail_drafts/i.test(error.message)) {
      return Response.json({ success: true, data: [] })
    }
    return Response.json({ success: false, error: error.message }, { status: 500 })
  }
  return Response.json({ success: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const id = body?.id as string | undefined
  const row = {
    user_id: userId,
    to_address: String(body?.to ?? body?.to_address ?? '').slice(0, 500),
    cc: String(body?.cc ?? '').slice(0, 500),
    bcc: String(body?.bcc ?? '').slice(0, 500),
    subject: String(body?.subject ?? '').slice(0, 300),
    body: String(body?.body ?? '').slice(0, 100000),
    attachments: body?.attachments ?? [],
    updated_at: new Date().toISOString(),
  }

  const db = createAdminClient()

  if (id) {
    const { data, error } = await db
      .from('mail_drafts')
      .update(row)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
    return Response.json({ success: true, data })
  }

  const { data, error } = await db.from('mail_drafts').insert(row).select().single()
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ success: false, error: 'id requis' }, { status: 400 })

  const db = createAdminClient()
  const { error } = await db.from('mail_drafts').delete().eq('id', id).eq('user_id', userId)
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
