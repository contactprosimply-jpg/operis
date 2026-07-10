import Stripe from 'stripe'
import type { BillingPlan } from '@/lib/billing/plan-limits'

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

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

/** Prix Stripe de l'option "+10 Go" (récurrent, quantité = nombre d'unités achetées).
 *  Retourne null tant que le produit n'a pas été créé dans le dashboard Stripe / configuré
 *  en variable d'env — l'add-on reste alors simplement indisponible (pas d'erreur bloquante). */
export function getStripeStorageAddonPriceId(): string | null {
  return process.env.STRIPE_PRICE_STORAGE_ADDON?.trim() || null
}
