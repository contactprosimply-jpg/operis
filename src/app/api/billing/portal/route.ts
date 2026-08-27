export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveBillingOrg } from '@/lib/billing/subscription'
import { getStripe } from '@/lib/billing/stripe'
import { billingReturnUrlsFromOrigin, requestOrigin } from '@/lib/billing/request-origin'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const { orgId, isOwner } = await resolveBillingOrg(db, userId)
  if (!orgId || !isOwner) {
    return Response.json({
      success: false,
      error: 'Seul le créateur du groupe peut gérer la facturation',
    }, { status: 403 })
  }

  const { data: sub } = await db
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    return Response.json({
      success: false,
      error: 'Aucun client Stripe — souscrivez une offre d\'abord',
    }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    const urls = billingReturnUrlsFromOrigin(requestOrigin(req))
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: urls.success,
    })
    return Response.json({ success: true, url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur portail Stripe'
    console.error('[billing/portal]', message, err)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
