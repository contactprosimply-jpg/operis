'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import PricingPlans from '@/components/billing/PricingPlans'
import { authFetch } from '@/lib/auth-client'
import { Spinner } from '@/components/ui'
import type { BillingPlan } from '@/lib/billing/plan-limits'

function ChoosePlanContent() {
  const router = useRouter()
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkingAccess, setCheckingAccess] = useState(true)

  useEffect(() => {
    let cancelled = false
    authFetch('/api/billing/status')
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.success && json.data.has_access) {
          router.replace('/dashboard')
        }
      })
      .catch(() => {
        // Session invalide : AuthProvider gère la déconnexion
      })
      .finally(() => {
        if (!cancelled) setCheckingAccess(false)
      })
    return () => { cancelled = true }
  }, [router])

  const handleCheckout = async (plan: BillingPlan) => {
    setLoadingPlan(plan)
    setError(null)
    try {
      const res = await authFetch(`/api/billing/checkout?plan=${plan}`)
      const json = await res.json()
      if (json.success && json.url) {
        window.location.href = json.url
        return
      }
      setError(json.error ?? `Erreur checkout (${res.status})`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setLoadingPlan(null)
    }
  }

  if (checkingAccess) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(37,99,235,0.12), transparent)',
      padding: '48px 24px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 52, height: 52, background: 'var(--gradient-primary)', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'DM Mono, monospace', fontSize: 17, fontWeight: 700, color: '#fff',
            margin: '0 auto 20px', boxShadow: 'var(--shadow-glow)',
          }}>OP</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            Choisissez une offre
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto' }}>
            Un abonnement actif est requis pour accéder à Operis. Sélectionnez Pro ou Business pour continuer.
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', color: '#b91c1c', padding: 14, borderRadius: 10,
            marginBottom: 24, fontSize: 14, textAlign: 'center', border: '1px solid #fecaca',
          }}>
            {error}
          </div>
        )}

        <PricingPlans
          onSelectPlan={handleCheckout}
          loadingPlan={loadingPlan}
          subscribeLabel="S'abonner"
        />
      </div>
    </div>
  )
}

export default function ChoosePlanPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={28} />
      </div>
    }>
      <ChoosePlanContent />
    </Suspense>
  )
}
