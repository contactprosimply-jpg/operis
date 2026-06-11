export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { formatImapError, resolveMailAccount, syncUserMailAccounts } from '@/lib/mail-sync'
import { checkRateLimit } from '@/lib/rateLimit'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const backfill = body?.backfill === true
  const quick = body?.quick === true

  const rate = backfill ? { allowed: true, retryAfterMinutes: 0 } : checkRateLimit(userId)
  if (!rate.allowed) {
    return Response.json({
      success: false,
      error: `Limite de synchronisation atteinte. Réessayez dans ${rate.retryAfterMinutes} minute${rate.retryAfterMinutes > 1 ? 's' : ''}.`,
    }, { status: 429 })
  }

  const appEnv = process.env.APP_ENV || process.env.VERCEL_ENV || 'development'
  let supabaseHost = 'unknown'
  try {
    supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').host
  } catch { /* ignore */ }
  console.log(`[mail/sync] APP_ENV=${appEnv} supabase=${supabaseHost} user=${userId} personal`)

  const account = await resolveMailAccount(userId)
  if (!account) {
    return Response.json({
      success: false,
      error: 'Aucun compte mail configuré. Paramètres → Messagerie : enregistrez votre email IMAP et mot de passe, puis testez la connexion.',
      data: {
        accounts: [{
          user_id: userId,
          email: null,
          display_name: null,
          status: 'skipped',
          reason: 'compte_mail_non_configure',
        }],
      },
    }, { status: 400 })
  }

  try {
    const result = await syncUserMailAccounts(userId, { backfill, quick })
    console.log(`[mail/sync] user=${userId} fetched=${result.fetched} stored=${result.stored} errors=${result.errors}`)
    return Response.json({ success: true, data: result })
  } catch (e) {
    return Response.json({
      success: false,
      error: `Erreur IMAP: ${formatImapError(e)}`,
    }, { status: 500 })
  }
}
