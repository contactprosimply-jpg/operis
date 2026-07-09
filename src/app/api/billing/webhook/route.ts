export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase'
import { getStripe } from '@/lib/billing/stripe'
import { stripeSubscriptionPeriodEnd } from '@/lib/billing/stripe-subscription'
import { resolveUserId, upsertFromStripeSubscription } from '@/lib/billing/upsert-subscription'
import type { BillingPlan } from '@/lib/billing/plan-limits'

async function resolveOrgId(
  db: ReturnType<typeof createAdminClient>,
  options: { orgId?: string; userId?: string | null },
): Promise<string | null> {
  if (options.orgId) return options.orgId
  if (!options.userId) return null
  const { ensureBillingOrg } = await import('@/lib/billing/subscription')
  try {
    const { orgId } = await ensureBillingOrg(db, options.userId)
    return orgId
  } catch (err) {
    console.error('[billing/webhook] impossible de résoudre org_id', { userId: options.userId, err })
    return null
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    return Response.json({ error: 'STRIPE_WEBHOOK_SECRET manquant' }, { status: 500 })
  }

  const body = await req.text()
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return Response.json({ error: 'Signature manquante' }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature invalide'
    return Response.json({ error: message }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription' || !session.subscription) break

        const userId = resolveUserId(session.client_reference_id, session.metadata)
        const orgId = session.metadata?.org_id
        const plan = session.metadata?.plan as BillingPlan | undefined
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string)

        await upsertFromStripeSubscription(stripeSub, {
          fallbackOrgId: orgId,
          fallbackUserId: userId,
          fallbackPlan: plan,
          forceActive: true,
        })

        console.info('[billing/webhook] checkout.session.completed — status=active pour utilisateur', {
          userId,
          orgId,
          plan,
          stripeSubscriptionId: stripeSub.id,
          stripeCustomerId: session.customer,
        })
        break
      }
      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription
        await upsertFromStripeSubscription(stripeSub, {
          fallbackUserId: resolveUserId(null, stripeSub.metadata),
        })
        break
      }
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription
        const userId = resolveUserId(null, stripeSub.metadata)
        let orgId: string | undefined = stripeSub.metadata?.org_id
        if (!orgId && userId) {
          const db = createAdminClient()
          orgId = (await resolveOrgId(db, { userId })) ?? undefined
        }
        if (!orgId) break
        const db = createAdminClient()
        await db.from('subscriptions').update({
          status: 'canceled',
          stripe_subscription_id: null,
          current_period_end: stripeSubscriptionPeriodEnd(stripeSub),
          updated_at: new Date().toISOString(),
        }).eq('org_id', orgId)
        console.info('[billing/webhook] subscription annulée', { orgId, userId, stripeSubscriptionId: stripeSub.id })
        break
      }
      default:
        break
    }
  } catch (err) {
    console.error('[billing/webhook]', err)
    return Response.json({ error: 'Traitement webhook echoue' }, { status: 500 })
  }

  return Response.json({ received: true })
}
