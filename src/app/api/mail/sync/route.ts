export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserEmailFromRequest, getUserFromRequest, unauthorized } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  formatImapError,
  resolveMailAccount,
  syncMailSingleBatch,
} from '@/lib/mail-sync'

/** Un lot IMAP court — viser < 30 s. */
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()
  const loginEmail = await getUserEmailFromRequest(req)

  const body = await req.json().catch(() => ({}))
  const reset = body?.reset === true

  const account = await resolveMailAccount(userId, { loginEmail })
  if (!account) {
    return Response.json({
      success: false,
      error: 'Aucun compte mail configuré. Paramètres → Messagerie : enregistrez votre email IMAP et mot de passe, puis testez la connexion.',
    }, { status: 400 })
  }

  const needsFullBackfill = !account.initial_sync_complete || !account.sent_initial_sync_complete
  const rate = (reset || needsFullBackfill)
    ? { allowed: true, retryAfterMinutes: 0 }
    : checkRateLimit(userId)

  if (!rate.allowed) {
    return Response.json({
      success: false,
      error: `Limite de synchronisation atteinte. Réessayez dans ${rate.retryAfterMinutes} minute${rate.retryAfterMinutes > 1 ? 's' : ''}.`,
    }, { status: 429 })
  }

  try {
    const batch = await syncMailSingleBatch(userId, { loginEmail, reset })
    return Response.json({
      success: true,
      data: {
        processed: batch.processed,
        stored: batch.stored,
        updated: batch.updated,
        nextCursor: batch.nextCursor,
        done: batch.done,
        total: batch.total,
        cumulativeProcessed: batch.cumulativeProcessed,
        phase: batch.phase,
        sessionStored: batch.sessionStored,
      },
    })
  } catch (e) {
    const msg = e instanceof Error && e.message === 'compte_mail_non_configure'
      ? 'Aucun compte mail configuré.'
      : formatImapError(e)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
