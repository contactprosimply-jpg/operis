import type Stripe from 'stripe'

/** Stripe API récente : current_period_end peut être sur la subscription ou le premier item. */
export function stripeSubscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const rootEnd = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end
  const itemEnd = (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end
  const seconds = rootEnd ?? itemEnd
  if (!seconds) return null
  return new Date(seconds * 1000).toISOString()
}
