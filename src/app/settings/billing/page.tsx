'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PricingPlans from '@/components/billing/PricingPlans'
import { authFetch } from '@/lib/auth-client'
import { Button, Spinner } from '@/components/ui'
import type { BillingPlan } from '@/lib/billing/plan-limits'
import { STORAGE_ADDON_GB_PER_UNIT } from '@/lib/billing/plan-limits'

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
  storage_addon_units: number
}

const EMPTY_LIMITS = { seats: 0, storageGb: 0 }
const EMPTY_USAGE = { seats: 1, storage_gb: 0 }

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  active: { bg: 'rgba(34,197,94,0.14)', fg: '#22c55e', label: 'Actif' },
  trialing: { bg: 'rgba(59,130,246,0.14)', fg: '#3b82f6', label: 'Essai' },
  past_due: { bg: 'rgba(245,158,11,0.16)', fg: '#f59e0b', label: 'Paiement en retard' },
  canceled: { bg: 'rgba(248,113,113,0.14)', fg: '#f87171', label: 'Annulé' },
  inactive: { bg: 'var(--bg-secondary)', fg: 'var(--text-muted)', label: 'Inactif' },
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function usageColor(ratio: number): string {
  if (ratio >= 0.95) return '#f87171'
  if (ratio >= 0.75) return '#f59e0b'
  return 'var(--accent)'
}

function UsageBar({ label, used, limit, unit }: { label: string; used: number; limit: number; unit: string }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0
  const color = usageColor(ratio)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {used} <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>/ {limit || '—'} {unit}</span>
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${ratio * 100}%`, borderRadius: 999,
          background: color, transition: 'width 0.3s ease, background 0.3s ease',
        }} />
      </div>
    </div>
  )
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
  const [addonLoading, setAddonLoading] = useState(false)

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

  const handleAddonChange = async (units: number) => {
    if (units < 0) return
    setAddonLoading(true)
    setCheckoutError(null)
    try {
      const res = await authFetch('/api/billing/storage-addon', {
        method: 'POST',
        body: JSON.stringify({ units }),
      })
      const json = await res.json()
      if (json.success) {
        await load()
      } else {
        setCheckoutError(json.error ?? 'Impossible de mettre à jour l\'option stockage')
      }
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Erreur réseau')
    } finally {
      setAddonLoading(false)
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
  const planLabel = data?.plan === 'business' ? 'Business' : data?.plan === 'pro' ? 'Pro' : 'Aucune offre'
  const canSubscribe = data?.is_owner || !data?.org_id
  const statusInfo = STATUS_STYLE[data?.status ?? ''] ?? STATUS_STYLE.inactive
  const addonUnits = data?.storage_addon_units ?? 0
  const isBusinessPlan = data?.plan === 'business'

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

      <div style={{
        borderRadius: 18, marginBottom: 24, overflow: 'hidden',
        border: isBusinessPlan ? '2px solid var(--accent)' : '1px solid var(--border)',
        boxShadow: isBusinessPlan ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
        background: 'var(--bg-card)',
      }}>
        <div style={{
          padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--border)',
          background: isBusinessPlan ? 'var(--gradient-primary)' : 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 20, fontWeight: 800,
              color: isBusinessPlan ? '#fff' : 'var(--text-primary)',
            }}>
              {planLabel}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
              background: isBusinessPlan ? 'rgba(255,255,255,0.2)' : statusInfo.bg,
              color: isBusinessPlan ? '#fff' : statusInfo.fg,
            }}>
              {statusInfo.label}
            </span>
          </div>
          <div style={{
            fontSize: 13,
            color: isBusinessPlan ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
          }}>
            Prochaine échéance : <strong>{formatDate(data?.current_period_end ?? null)}</strong>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            <UsageBar label="Utilisateurs" used={usage.seats} limit={limits.seats} unit="" />
            <UsageBar label="Stockage" used={usage.storage_gb} limit={limits.storageGb} unit="Go" />
          </div>

          {data?.stripe_subscription_id && canSubscribe && (
            <div style={{
              marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)',
              display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Option stockage <span style={{ color: 'var(--text-muted)' }}>(+{STORAGE_ADDON_GB_PER_UNIT} Go / unité)</span>
                </span>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg-secondary)',
                  borderRadius: 999, border: '1px solid var(--border-hi)', padding: 3,
                }}>
                  <button
                    type="button"
                    disabled={addonLoading || addonUnits === 0}
                    onClick={() => handleAddonChange(addonUnits - 1)}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: addonUnits === 0 ? 'default' : 'pointer',
                      background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 15, fontWeight: 700,
                      opacity: addonUnits === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 22, textAlign: 'center', color: 'var(--text-primary)' }}>
                    {addonUnits}
                  </span>
                  <button
                    type="button"
                    disabled={addonLoading}
                    onClick={() => handleAddonChange(addonUnits + 1)}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: 'var(--gradient-primary)', color: '#fff', fontSize: 15, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    +
                  </button>
                </div>
                {addonUnits > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    +{addonUnits * STORAGE_ADDON_GB_PER_UNIT} Go inclus dans la limite ci-dessus
                  </span>
                )}
              </div>

              <Button variant="ghost" onClick={handlePortal} disabled={portalLoading}>
                {portalLoading ? 'Ouverture…' : 'Portail Stripe →'}
              </Button>
            </div>
          )}
        </div>
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
