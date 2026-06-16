'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PricingPlans from '@/components/billing/PricingPlans'
import { authFetch } from '@/lib/auth-client'
import { Button, Spinner } from '@/components/ui'
import type { BillingPlan } from '@/lib/billing/plan-limits'

type BillingData = {
  has_access: boolean
  plan: BillingPlan | null
  status: string | null
  current_period_end: string | null
  limits: { seats: number; storageGb: number }
  usage: { seats: number; storage_gb: number }
  is_owner: boolean
  org_id: string | null
  stripe_subscription_id: string | null
}

const EMPTY_LIMITS = { seats: 0, storageGb: 0 }
const EMPTY_USAGE = { seats: 1, storage_gb: 0 }

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function BillingSettingsContent() {
  const searchParams = useSearchParams()
  const canceled = searchParams.get('canceled') === '1'

  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await authFetch('/api/billing/status')
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch {
      // Page reste utilisable même si le statut échoue temporairement
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (canceled) {
      setStatusMessage('Paiement annulé. Vous pouvez choisir une offre ci-dessous.')
    }
  }, [canceled])

  const handleCheckout = async (plan: BillingPlan) => {
    setLoadingPlan(plan)
    setCheckoutError(null)
    setStatusMessage(null)
    try {
      const res = await authFetch(`/api/billing/checkout?plan=${plan}`)
      const json = await res.json()
      if (json.success && json.url) {
        window.location.href = json.url
        return
      }
      setCheckoutError(json.error ?? `Erreur checkout (${res.status})`)
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setLoadingPlan(null)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    setCheckoutError(null)
    try {
      const res = await authFetch('/api/billing/portal', { method: 'POST' })
      const json = await res.json()
      if (json.success && json.url) {
        window.location.href = json.url
        return
      }
      setCheckoutError(json.error ?? 'Impossible d\'ouvrir le portail Stripe')
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Erreur réseau')
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

  const limits = data?.limits ?? EMPTY_LIMITS
  const usage = data?.usage ?? EMPTY_USAGE
  const planLabel = data?.plan === 'business' ? 'Business' : data?.plan === 'pro' ? 'Pro' : 'Aucun'
  const canSubscribe = data?.is_owner || !data?.org_id

  return (
    <div style={{ padding: '24px 0', maxWidth: 960 }}>
      <div style={{ marginBottom: 24 }}>
        {data?.has_access && (
          <Link href="/settings" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>
            ← Paramètres
          </Link>
        )}
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '12px 0 4px', color: 'var(--text-primary)' }}>
          Facturation
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Plan actuel, utilisation et gestion de l&apos;abonnement Stripe.
        </p>
      </div>

      {statusMessage && (
        <div style={{
          background: 'var(--accent-soft)', color: 'var(--accent)', padding: 14, borderRadius: 10,
          marginBottom: 20, fontSize: 14, border: '1px solid rgba(59,130,246,0.35)',
        }}>
          {statusMessage}
        </div>
      )}

      {checkoutError && (
        <div style={{
          background: '#fef2f2', color: '#b91c1c', padding: 14, borderRadius: 10,
          marginBottom: 20, fontSize: 14, border: '1px solid #fecaca',
        }}>
          {checkoutError}
        </div>
      )}

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
              {usage.seats} / {limits.seats}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Stockage</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {usage.storage_gb} Go / {limits.storageGb} Go
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Fin de période</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {formatDate(data?.current_period_end ?? null)}
            </div>
          </div>
        </div>

        {data?.stripe_subscription_id && canSubscribe && (
          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={handlePortal} disabled={portalLoading}>
              {portalLoading ? 'Ouverture…' : 'Portail Stripe'}
            </Button>
          </div>
        )}
      </div>

      {canSubscribe ? (
        <PricingPlans
          currentPlan={data?.has_access ? data.plan : null}
          isOwner={true}
          onSelectPlan={handleCheckout}
          loadingPlan={loadingPlan}
          subscribeLabel="S'abonner"
        />
      ) : (
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Contactez le créateur du groupe pour gérer l&apos;abonnement.
        </p>
      )}
    </div>
  )
}

export default function BillingSettingsPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    }>
      <BillingSettingsContent />
    </Suspense>
  )
}
