export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserEmailFromRequest, getUserFromRequest, unauthorized } from '@/lib/auth'

const ACCOUNT_FIELDS = 'id, imap_host, imap_port, imap_user, smtp_host, smtp_port, smtp_user, is_active, last_sync, initial_sync_complete, mailbox_total, sent_initial_sync_complete, sent_mailbox_total'

function pickPrimaryAccount(
  accounts: Array<{ imap_user?: string | null }>,
  loginEmail: string | null,
) {
  if (!accounts.length) return null
  const normalized = loginEmail?.toLowerCase().trim()
  if (normalized) {
    const match = accounts.find(a => a.imap_user?.toLowerCase().trim() === normalized)
    if (match) return match
  }
  return accounts[0]
}

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const loginEmail = await getUserEmailFromRequest(req)
  const db = createAdminClient()
  const { data, error } = await db
    .from('mail_accounts')
    .select(ACCOUNT_FIELDS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  const accounts = data ?? []
  const primary = pickPrimaryAccount(accounts, loginEmail)

  return Response.json({
    success: true,
    data: primary,
    accounts,
  })
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const { imap_host, imap_port, imap_user, imap_pass, smtp_host, smtp_port, smtp_user, smtp_pass } = body

  if (!imap_user) {
    return Response.json({ success: false, error: 'Email requis' }, { status: 400 })
  }

  const db = createAdminClient()
  const trimmedUser = imap_user.trim()

  let password = imap_pass
  if (!password) {
    const { data: existing } = await db
      .from('mail_accounts')
      .select('imap_pass, smtp_pass')
      .eq('user_id', userId)
      .eq('imap_user', trimmedUser)
      .maybeSingle()
    password = existing?.imap_pass
  }

  if (!password) {
    return Response.json({ success: false, error: 'Mot de passe requis' }, { status: 400 })
  }

  const smtpPassword = smtp_pass || password

  const { data, error } = await db
    .from('mail_accounts')
    .upsert({
      user_id: userId,
      imap_host: imap_host || 'mail.gandi.net',
      imap_port: Number(imap_port) || 993,
      imap_user: trimmedUser,
      imap_pass: password,
      smtp_host: smtp_host || 'mail.gandi.net',
      smtp_port: Number(smtp_port) || 587,
      smtp_user: (smtp_user || imap_user).trim(),
      smtp_pass: smtpPassword,
      is_active: true,
    }, { onConflict: 'user_id,imap_user' })
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const accountId = body?.id as string | undefined
  if (!accountId) {
    return Response.json({ success: false, error: 'id requis' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: row, error: fetchError } = await db
    .from('mail_accounts')
    .select('id, imap_user')
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchError) return Response.json({ success: false, error: fetchError.message }, { status: 500 })
  if (!row) return Response.json({ success: false, error: 'Boite introuvable' }, { status: 404 })

  const { error } = await db
    .from('mail_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', userId)

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  return Response.json({
    success: true,
    data: { deleted: true, imap_user: row.imap_user },
  })
}
