export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase'
import { getStripe, planFromStripePriceId } from '@/lib/billing/stripe'
import { stripeSubscriptionPeriodEnd } from '@/lib/billing/stripe-subscription'
import type { BillingPlan } from '@/lib/billing/plan-limits'

async function upsertFromStripeSubscription(
  stripeSub: Stripe.Subscription,
  fallbackOrgId?: string,
  fallbackPlan?: BillingPlan,
) {
  const db = createAdminClient()
  const orgId = stripeSub.metadata?.org_id ?? fallbackOrgId
  if (!orgId) {
    console.error('[billing/webhook] org_id manquant pour subscription', stripeSub.id)
    return
  }

  const priceId = stripeSub.items.data[0]?.price?.id
  const plan = (stripeSub.metadata?.plan as BillingPlan | undefined)
    ?? fallbackPlan
    ?? (priceId ? planFromStripePriceId(priceId) : null)

  const customerId = typeof stripeSub.customer === 'string'
    ? stripeSub.customer
    : stripeSub.customer?.id

  await db.from('subscriptions').upsert({
    org_id: orgId,
    stripe_customer_id: customerId ?? null,
    stripe_subscription_id: stripeSub.id,
    status: stripeSub.status,
    plan,
    current_period_end: stripeSubscriptionPeriodEnd(stripeSub),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id' })
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
        const orgId = session.metadata?.org_id
        const plan = session.metadata?.plan as BillingPlan | undefined
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string)
        await upsertFromStripeSubscription(stripeSub, orgId, plan)
        break
      }
      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription
        await upsertFromStripeSubscription(stripeSub)
        break
      }
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription
        const orgId = stripeSub.metadata?.org_id
        if (!orgId) break
        const db = createAdminClient()
        await db.from('subscriptions').update({
          status: 'canceled',
          stripe_subscription_id: null,
          current_period_end: stripeSubscriptionPeriodEnd(stripeSub),
          updated_at: new Date().toISOString(),
        }).eq('org_id', orgId)
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
