'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PricingPlans from '@/components/billing/PricingPlans'
import { authFetch } from '@/lib/auth-client'
import { Button, Spinner } from '@/components/ui'
import type { BillingPlan } from '@/lib/billing/plan-limits'

type BillingData = {
  has_access: boolean
  in_trial: boolean
  plan: BillingPlan | null
  status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  limits: { seats: number; storageGb: number }
  usage: { seats: number; storage_gb: number }
  is_owner: boolean
  stripe_subscription_id: string | null
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function BillingSettingsPage() {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  const load = async () => {
    const res = await authFetch('/api/billing/status')
    const json = await res.json()
    if (json.success) setData(json.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCheckout = async (plan: BillingPlan) => {
    setLoadingPlan(plan)
    try {
      const res = await authFetch(`/api/billing/checkout?plan=${plan}`)
      const json = await res.json()
      if (json.success && json.url) window.location.href = json.url
    } finally {
      setLoadingPlan(null)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    try {
      const res = await authFetch('/api/billing/portal', { method: 'POST' })
      const json = await res.json()
      if (json.success && json.url) window.location.href = json.url
    } finally {
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  const planLabel = data?.plan === 'business' ? 'Business' : data?.plan === 'pro' ? 'Pro' : data?.in_trial ? 'Essai' : 'Aucun'

  return (
    <div style={{ padding: '24px 0', maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/settings" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>
          ← Paramètres
        </Link>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '12px 0 4px', color: 'var(--text-primary)' }}>
          Facturation
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Plan actuel, utilisation et gestion de l&apos;abonnement Stripe.
        </p>
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Offre</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{planLabel}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              {data?.status ?? '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Utilisateurs</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {data?.usage.seats ?? 0} / {data?.limits.seats ?? 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Stockage</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {data?.usage.storage_gb ?? 0} Go / {data?.limits.storageGb ?? 0} Go
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Fin essai / période</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {formatDate(data?.in_trial ? data.trial_ends_at : data?.current_period_end ?? null)}
            </div>
          </div>
        </div>

        {data?.is_owner && (
          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {data.stripe_subscription_id && (
              <Button variant="secondary" onClick={handlePortal} disabled={portalLoading}>
                {portalLoading ? 'Ouverture…' : 'Portail Stripe'}
              </Button>
            )}
            <Link href="/pricing">
              <Button variant="primary">Voir les offres</Button>
            </Link>
          </div>
        )}
      </div>

      {data?.is_owner && (
        <PricingPlans
          currentPlan={data.plan}
          isOwner={data.is_owner}
          onSelectPlan={handleCheckout}
          loadingPlan={loadingPlan}
        />
      )}
    </div>
  )
}
