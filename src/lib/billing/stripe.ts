import Stripe from 'stripe'
import type { BillingPlan } from '@/lib/billing/plan-limits'

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY requis')
  return new Stripe(key)
}

export function getStripePriceId(plan: BillingPlan): string {
  const priceId = plan === 'pro'
    ? process.env.STRIPE_PRICE_PRO
    : process.env.STRIPE_PRICE_BUSINESS
  if (!priceId) throw new Error(`Prix Stripe manquant pour le plan ${plan}`)
  return priceId
}

export function planFromStripePriceId(priceId: string): BillingPlan | null {
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return 'business'
  return null
}
