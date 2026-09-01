import type { BillingPlan } from './plan-limits'

/**
 * Source unique du contenu marketing des offres (nom, prix affiché, description,
 * bullets) — utilisée par la landing page (/) et /pricing pour ne jamais avoir deux
 * copies qui divergent silencieusement.
 *
 * Le prix ici est du TEXTE D'AFFICHAGE, pas la source de vérité du montant facturé :
 * le montant réel vient de Stripe (STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS, voir
 * getStripePriceId() dans lib/billing/stripe.ts). Si le prix Stripe change, mettre à
 * jour ce fichier en même temps.
 */
export interface PlanCatalogEntry {
  id: BillingPlan
  name: string
  price: string
  desc: string
  features: string[]
  highlight?: boolean
}

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: 'pro',
    name: 'Pro',
    price: '79,99',
    desc: 'Pour les petites équipes BTP',
    features: [
      '2 utilisateurs max',
      '20 Go de stockage documents',
      'Suivi des AO et fournisseurs',
      'Messagerie intégrée (optionnelle)',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: '129,99',
    desc: 'Pour les équipes qui veulent aller plus vite',
    features: [
      '5 utilisateurs max',
      '50 Go de stockage documents',
      'Extraction automatique des prix depuis les PDF',
      'Support prioritaire',
    ],
    highlight: true,
  },
]
