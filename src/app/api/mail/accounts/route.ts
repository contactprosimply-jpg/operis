import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const { data, error } = await db
    .from('mail_accounts')
    .select('id, imap_host, imap_port, imap_user, smtp_host, smtp_port, smtp_user, is_active, last_sync')
    .eq('user_id', userId)
    .single()

  if (error) return Response.json({ success: true, data: null })
  return Response.json({ success: true, data })
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const { imap_host, imap_port, imap_user, imap_pass, smtp_host, smtp_port, smtp_user, smtp_pass } = body

  if (!imap_user || !imap_pass) {
    return Response.json({ success: false, error: 'Email et mot de passe requis' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data, error } = await db
    .from('mail_accounts')
    .upsert({
      user_id: userId,
      imap_host: imap_host || 'mail.gandi.net',
      imap_port: imap_port || 993,
      imap_user,
      imap_pass,
      smtp_host: smtp_host || 'mail.gandi.net',
      smtp_port: smtp_port || 587,
      smtp_user: smtp_user || imap_user,
      smtp_pass: smtp_pass || imap_pass,
    }, { onConflict: 'user_id,imap_user' })
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}