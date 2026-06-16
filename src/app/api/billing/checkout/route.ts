export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getBillingContext, resolveBillingOrg } from '@/lib/billing/subscription'
import { getStripe, getStripePriceId, billingReturnUrls } from '@/lib/billing/stripe'
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
  const { orgId, isOwner } = await resolveBillingOrg(db, userId)
  if (!orgId || !isOwner) {
    return Response.json({
      success: false,
      error: 'Seul le createur du groupe peut souscrire un abonnement',
    }, { status: 403 })
  }

  const { data: sub } = await db.from('subscriptions').select('*').eq('org_id', orgId).maybeSingle()
  const stripe = getStripe()
  const urls = billingReturnUrls()

  let customerId = sub?.stripe_customer_id as string | null
  if (!customerId) {
    const { data: { user } } = await db.auth.admin.getUserById(userId)
    const customer = await stripe.customers.create({
      email: user?.email ?? undefined,
      metadata: { org_id: orgId, user_id: userId },
    })
    customerId = customer.id
    await db.from('subscriptions').upsert({
      org_id: orgId,
      stripe_customer_id: customerId,
      status: sub?.status ?? 'trialing',
      trial_ends_at: sub?.trial_ends_at ?? null,
    }, { onConflict: 'org_id' })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: getStripePriceId(plan), quantity: 1 }],
    success_url: urls.success,
    cancel_url: urls.cancel,
    metadata: { org_id: orgId, plan, user_id: userId },
    subscription_data: {
      metadata: { org_id: orgId, plan },
    },
  })

  return Response.json({ success: true, url: session.url })
}
