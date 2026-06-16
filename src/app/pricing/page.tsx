'use client'

import { useState } from 'react'
import Link from 'next/link'
import PricingPlans from '@/components/billing/PricingPlans'
import { authFetch } from '@/lib/auth-client'
import type { BillingPlan } from '@/lib/billing/plan-limits'

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelectPlan = async (plan: BillingPlan) => {
    setLoadingPlan(plan)
    setError(null)
    try {
      const res = await authFetch(`/api/billing/checkout?plan=${plan}`)
      const data = await res.json()
      if (data.success && data.url) {
        window.location.href = data.url
        return
      }
      setError(data.error ?? 'Impossible de lancer le paiement')
    } catch {
      setError('Erreur de connexion')
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
          Tarifs Operis
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto' }}>
          Deux offres simples, par siège. Essai gratuit 14 jours. Sans engagement.
        </p>
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
          <Link href="/settings/billing" style={{ color: 'var(--accent)' }}>Gérer mon abonnement</Link>
        </p>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2',
          color: '#b91c1c',
          padding: 12,
          borderRadius: 8,
          marginBottom: 20,
          textAlign: 'center',
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      <PricingPlans onSelectPlan={handleSelectPlan} loadingPlan={loadingPlan} />
    </div>
  )
}
