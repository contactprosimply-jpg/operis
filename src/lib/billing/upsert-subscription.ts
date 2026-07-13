import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase'
import { ensureBillingOrg } from '@/lib/billing/subscription'
import { planFromStripePriceId, getStripeStorageAddonPriceId } from '@/lib/billing/stripe'
import { stripeSubscriptionPeriodEnd } from '@/lib/billing/stripe-subscription'
import { effectiveStorageLimitBytes, type BillingPlan } from '@/lib/billing/plan-limits'

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

  // items.data[0] n'est pas fiable dès qu'un 2e item (l'option stockage) existe sur le
  // même abonnement — on cherche explicitement l'item dont le prix correspond à un plan connu.
  const planItem = stripeSub.items.data.find(item => planFromStripePriceId(item.price?.id ?? '') !== null)
  const priceId = planItem?.price?.id ?? stripeSub.items.data[0]?.price?.id
  const plan = (stripeSub.metadata?.plan as BillingPlan | undefined)
    ?? options.fallbackPlan
    ?? (priceId ? planFromStripePriceId(priceId) : null)

  const addonPriceId = getStripeStorageAddonPriceId()
  const addonItem = addonPriceId ? stripeSub.items.data.find(item => item.price?.id === addonPriceId) : undefined
  const storageAddonUnits = addonItem?.quantity ?? 0

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
    storage_addon_units: storageAddonUnits,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id' })

  if (error) {
    console.error('[billing] upsert subscriptions échoué', { orgId, userId, error })
    throw error
  }

  const quotaBytes = status === 'active' ? effectiveStorageLimitBytes(plan, storageAddonUnits) : 0
  await db.from('organizations').update({ storage_quota_bytes: quotaBytes }).eq('id', orgId)

  console.info('[billing] subscription mise à jour', {
    orgId,
    userId,
    stripeSubscriptionId: stripeSub.id,
    stripeCustomerId: customerId,
    plan,
    status,
    currentPeriodEnd,
    storageAddonUnits,
  })
}
