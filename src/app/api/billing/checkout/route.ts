export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { ensureBillingOrg } from '@/lib/billing/subscription'
import { getStripe, getStripePriceId } from '@/lib/billing/stripe'
import { billingReturnUrlsFromOrigin, requestOrigin } from '@/lib/billing/request-origin'
import type { BillingPlan } from '@/lib/billing/plan-limits'

function parsePlan(value: string | null): BillingPlan | null {
  if (value === 'pro' || value === 'business') return value
  return null
}

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const plan = parsePlan(req.nextUrl.searchParams.get('plan'))
  if (!plan) {
    return Response.json({ success: false, error: 'plan requis (pro ou business)' }, { status: 400 })
  }

  const db = createAdminClient()

  try {
    const { orgId } = await ensureBillingOrg(db, userId)

    const { data: sub } = await db.from('subscriptions').select('*').eq('org_id', orgId).maybeSingle()
    const stripe = getStripe()
    const urls = billingReturnUrlsFromOrigin(requestOrigin(req))
    const priceId = getStripePriceId(plan)

    const { data: { user } } = await db.auth.admin.getUserById(userId)
    const customerEmail = user?.email ?? undefined
    const existingCustomerId = sub?.stripe_customer_id as string | null

    if (!existingCustomerId && !customerEmail) {
      return Response.json({ success: false, error: 'Email utilisateur introuvable' }, { status: 400 })
    }

    console.info('[billing/checkout] creating session', {
      userId,
      orgId,
      plan,
      priceId,
      hasCustomer: Boolean(existingCustomerId),
    })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : { customer_email: customerEmail }),
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: urls.success,
      cancel_url: urls.cancel,
      metadata: { org_id: orgId, plan, user_id: userId },
      subscription_data: {
        metadata: { org_id: orgId, plan, user_id: userId },
      },
    })

    if (!session.url) {
      console.error('[billing/checkout] session sans URL', { sessionId: session.id })
      return Response.json({ success: false, error: 'Stripe n\'a pas renvoyé une URL de paiement' }, { status: 500 })
    }

    return Response.json({ success: true, url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur checkout Stripe'
    console.error('[billing/checkout]', message, err)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
