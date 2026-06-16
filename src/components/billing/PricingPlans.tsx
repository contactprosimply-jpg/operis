'use client'

import type { BillingPlan } from '@/lib/billing/plan-limits'
import { Button } from '@/components/ui'

const PLANS: Array<{
  id: BillingPlan
  name: string
  price: string
  desc: string
  features: string[]
  highlight?: boolean
}> = [
  {
    id: 'pro',
    name: 'Pro',
    price: '79,99',
    desc: 'Pour les petites équipes BTP',
    features: [
      '2 utilisateurs max',
      '20 Go de stockage documents',
      'AO & messagerie synchronisée',
      'Consultations fournisseurs',
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
      'Analyse IA des devis',
      'Rapports avancés',
      'Support prioritaire',
    ],
    highlight: true,
  },
]

type PricingPlansProps = {
  currentPlan?: BillingPlan | null
  isOwner?: boolean
  onSelectPlan?: (plan: BillingPlan) => void
  loadingPlan?: BillingPlan | null
  /** Lien inscription/connexion quand visiteur non connecté */
  guestCtaHref?: string
}

export default function PricingPlans({
  currentPlan,
  isOwner = true,
  onSelectPlan,
  loadingPlan,
  guestCtaHref = '/register?redirect=/pricing',
}: PricingPlansProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 20,
      maxWidth: 900,
      margin: '0 auto',
    }}>
      {PLANS.map(plan => {
        const isCurrent = currentPlan === plan.id
        const isPopular = plan.highlight
        return (
          <div
            key={plan.id}
            style={{
              position: 'relative',
              background: 'var(--bg-primary)',
              border: isPopular ? '2px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 16,
              padding: 28,
              boxShadow: isPopular ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
            }}
          >
            {isPopular && (
              <div style={{
                position: 'absolute',
                top: -12,
                left: 50,
                transform: 'translateX(-50%)',
                background: 'var(--gradient-primary)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 14px',
                borderRadius: 999,
                whiteSpace: 'nowrap',
              }}>
                ⭐ Le plus populaire
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              {plan.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              {plan.desc}
            </div>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)' }}>{plan.price}€</span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}> / mois</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {plan.features.map(f => (
                <li key={f} style={{ fontSize: 14, color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--accent)', flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {onSelectPlan && isOwner ? (
              <Button
                variant={isPopular ? 'primary' : 'ghost'}
                disabled={isCurrent || loadingPlan === plan.id}
                onClick={() => onSelectPlan(plan.id)}
                style={{ width: '100%' }}
              >
                {loadingPlan === plan.id ? 'Redirection…' : isCurrent ? 'Offre actuelle' : 'Choisir cette offre'}
              </Button>
            ) : !isOwner ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
                Contactez le créateur du groupe pour changer d&apos;offre.
              </p>
            ) : (
              <a
                href={guestCtaHref}
                style={{
                  display: 'block', textAlign: 'center', textDecoration: 'none',
                  background: isPopular ? 'var(--gradient-primary)' : 'var(--bg-secondary)',
                  color: isPopular ? '#fff' : 'var(--text-primary)',
                  border: isPopular ? 'none' : '1px solid var(--border-hi)',
                  borderRadius: 9, padding: '10px 16px', fontSize: 12, fontWeight: 600,
                  boxShadow: isPopular ? 'var(--shadow-glow)' : 'none',
                }}
              >
                Créer un compte — essai 14 jours
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
