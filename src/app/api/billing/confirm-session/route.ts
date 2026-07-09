export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { getStripe } from '@/lib/billing/stripe'
import { upsertFromStripeSubscription } from '@/lib/billing/upsert-subscription'
import type { BillingPlan } from '@/lib/billing/plan-limits'

/**
 * Vérifie directement une session Stripe Checkout et écrit l'abonnement en DB —
 * ne dépend pas du délai de livraison du webhook. Le webhook reste la source de vérité
 * à long terme (renouvellements, annulations) ; cette route ne fait que débloquer
 * l'utilisateur immédiatement après un paiement réussi, de façon idempotente.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) {
    return Response.json({ success: false, error: 'session_id requis' }, { status: 400 })
  }

  const stripe = getStripe()

  let session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Session Stripe introuvable'
    return Response.json({ success: false, error: message }, { status: 400 })
  }

  // Empêche un utilisateur de confirmer la session Stripe d'un autre compte.
  if (session.client_reference_id && session.client_reference_id !== userId) {
    return Response.json({ success: false, error: 'Session non associée à ce compte' }, { status: 403 })
  }

  if (session.mode !== 'subscription' || !session.subscription) {
    return Response.json({ success: true, data: { active: false } })
  }

  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    return Response.json({ success: true, data: { active: false } })
  }

  const stripeSub = typeof session.subscription === 'string'
    ? await stripe.subscriptions.retrieve(session.subscription)
    : session.subscription

  await upsertFromStripeSubscription(stripeSub, {
    fallbackOrgId: session.metadata?.org_id,
    fallbackUserId: userId,
    fallbackPlan: session.metadata?.plan as BillingPlan | undefined,
    forceActive: true,
  })

  return Response.json({ success: true, data: { active: true } })
}
