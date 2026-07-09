'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PricingPlans from '@/components/billing/PricingPlans'
import { authFetch } from '@/lib/auth-client'
import { supabase } from '@/lib/supabase'
import type { BillingPlan } from '@/lib/billing/plan-limits'
import { OperisLogoMark } from '@/components/OperisLogoMark'

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(Boolean(session))
      setCheckingAuth(false)
    })
  }, [])

  const handleSelectPlan = async (plan: BillingPlan) => {
    if (!isLoggedIn) return
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
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text-primary)' }}>
          <OperisLogoMark size={36} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>Operis</span>
        </Link>
        <div style={{ display: 'flex', gap: 10 }}>
          {isLoggedIn ? (
            <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
              Mon espace →
            </Link>
          ) : (
            <>
              <Link href="/login?redirect=/pricing" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>
                Connexion
              </Link>
              <Link href="/register?redirect=/pricing" style={{
                fontSize: 13, color: '#fff', background: 'var(--gradient-primary)',
                padding: '8px 14px', borderRadius: 8, fontWeight: 600, textDecoration: 'none',
              }}>
                Créer un compte
              </Link>
            </>
          )}
        </div>
      </header>

      <div style={{ padding: '16px 24px 48px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
            Tarifs Operis
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto' }}>
            Deux offres simples, par siège. Sans engagement.
          </p>
          {isLoggedIn && (
            <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
              <Link href="/settings/billing" style={{ color: 'var(--accent)' }}>Gérer mon abonnement</Link>
            </p>
          )}
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', color: '#b91c1c', padding: 12, borderRadius: 8,
            marginBottom: 20, textAlign: 'center', fontSize: 14,
          }}>
            {error}
          </div>
        )}

        {!checkingAuth && !isLoggedIn && (
          <p style={{
            textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)',
            marginBottom: 24, padding: '12px 16px', background: 'var(--bg-secondary)',
            borderRadius: 10, border: '1px solid var(--border)',
          }}>
            Créez un compte ou connectez-vous pour souscrire via Stripe Checkout.
          </p>
        )}

        <PricingPlans
          onSelectPlan={isLoggedIn ? handleSelectPlan : undefined}
          loadingPlan={loadingPlan}
          guestCtaHref="/register?redirect=/pricing"
          subscribeLabel="S'abonner"
        />
      </div>
    </div>
  )
}
