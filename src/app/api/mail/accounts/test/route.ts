export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { formatImapError, testImapConnection } from '@/lib/imap-client'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { imap_host, imap_port, imap_user, imap_pass } = await req.json()

  if (!imap_host || !imap_user) {
    return Response.json({ success: false, error: 'Paramètres manquants' }, { status: 400 })
  }

  let password = imap_pass
  if (!password) {
    const db = createAdminClient()
    const { data: existing } = await db
      .from('mail_accounts')
      .select('imap_pass')
      .eq('user_id', userId)
      .eq('imap_user', String(imap_user).trim())
      .maybeSingle()
    password = existing?.imap_pass
  }

  if (!password) {
    return Response.json({ success: false, error: 'Mot de passe requis' }, { status: 400 })
  }

  const config = {
    imap_host,
    imap_port: Number(imap_port) || 993,
    imap_user,
    imap_pass: password,
  }

  try {
    const { exists } = await testImapConnection(config)
    return Response.json({
      success: true,
      data: { message: 'Connexion reussie', exists, count: exists },
    })
  } catch (e) {
    return Response.json({
      success: false,
      error: `Connexion echouee : ${formatImapError(e)}`,
    }, { status: 400 })
  }
}
