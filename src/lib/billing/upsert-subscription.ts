import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase'
import { ensureBillingOrg } from '@/lib/billing/subscription'
import { planFromStripePriceId } from '@/lib/billing/stripe'
import { stripeSubscriptionPeriodEnd } from '@/lib/billing/stripe-subscription'
import type { BillingPlan } from '@/lib/billing/plan-limits'

export function resolveUserId(
  clientReferenceId?: string | null,
  metadata?: Stripe.Metadata | null,
): string | null {
  return clientReferenceId?.trim()
    || metadata?.user_id?.trim()
    || null
}

function normalizeStatus(stripeStatus: string, forceActive = false): string {
  if (forceActive || stripeStatus === 'active' || stripeStatus === 'trialing') return 'active'
  return stripeStatus
}

async function resolveOrgId(
  db: ReturnType<typeof createAdminClient>,
  options: { orgId?: string; userId?: string | null },
): Promise<string | null> {
  if (options.orgId) return options.orgId
  if (!options.userId) return null
  try {
    const { orgId } = await ensureBillingOrg(db, options.userId)
    return orgId
  } catch (err) {
    console.error('[billing] impossible de résoudre org_id', { userId: options.userId, err })
    return null
  }
}

/** Écrit l'état d'un abonnement Stripe en DB — appelé par le webhook ET par la vérification
 *  directe de session au retour de Stripe Checkout (idempotent, source de vérité = Stripe). */
export async function upsertFromStripeSubscription(
  stripeSub: Stripe.Subscription,
  options: {
    fallbackOrgId?: string
    fallbackUserId?: string | null
    fallbackPlan?: BillingPlan
    forceActive?: boolean
  } = {},
) {
  const db = createAdminClient()
  const userId = options.fallbackUserId
    ?? resolveUserId(null, stripeSub.metadata)

  let orgId: string | undefined = stripeSub.metadata?.org_id ?? options.fallbackOrgId
  if (!orgId) {
    orgId = (await resolveOrgId(db, { userId })) ?? undefined
  }
  if (!orgId && stripeSub.customer) {
    const customerId = typeof stripeSub.customer === 'string'
      ? stripeSub.customer
      : stripeSub.customer.id
    const { data: existing } = await db
      .from('subscriptions')
      .select('org_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    orgId = existing?.org_id ?? undefined
  }
  if (!orgId) {
    console.error('[billing] org_id manquant pour subscription', stripeSub.id, { userId })
    return
  }

  const priceId = stripeSub.items.data[0]?.price?.id
  const plan = (stripeSub.metadata?.plan as BillingPlan | undefined)
    ?? options.fallbackPlan
    ?? (priceId ? planFromStripePriceId(priceId) : null)

  const customerId = typeof stripeSub.customer === 'string'
    ? stripeSub.customer
    : stripeSub.customer?.id

  const status = normalizeStatus(stripeSub.status, options.forceActive)
  const currentPeriodEnd = stripeSubscriptionPeriodEnd(stripeSub)

  const { error } = await db.from('subscriptions').upsert({
    org_id: orgId,
    stripe_customer_id: customerId ?? null,
    stripe_subscription_id: stripeSub.id,
    status,
    plan,
    current_period_end: currentPeriodEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id' })

  if (error) {
    console.error('[billing] upsert subscriptions échoué', { orgId, userId, error })
    throw error
  }

  console.info('[billing] subscription mise à jour', {
    orgId,
    userId,
    stripeSubscriptionId: stripeSub.id,
    stripeCustomerId: customerId,
    plan,
    status,
    currentPeriodEnd,
  })
}
