export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { formatImapError, resolveMailAccount, syncMailAccount } from '@/lib/mail-sync'
import { checkRateLimit } from '@/lib/rateLimit'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const rate = checkRateLimit(userId)
  if (!rate.allowed) {
    return Response.json({
      success: false,
      error: `Limite de synchronisation atteinte. Réessayez dans ${rate.retryAfterMinutes} minute${rate.retryAfterMinutes > 1 ? 's' : ''}.`,
    }, { status: 429 })
  }

  const account = await resolveMailAccount(userId)
  if (!account) {
    return Response.json({
      success: false,
      error: 'Aucun compte mail configure. Va dans Parametres > Messagerie.',
    }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const backfill = body?.backfill === true
  const quick = body?.quick === true

  try {
    const result = await syncMailAccount(userId, account, { backfill, quick })
    return Response.json({ success: true, data: result })
  } catch (e) {
    return Response.json({
      success: false,
      error: `Erreur IMAP: ${formatImapError(e)}`,
    }, { status: 500 })
  }
}
