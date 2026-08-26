'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-client'

type BillingStatusState = { hasAccess: boolean; status: string | null } | null

export default function BillingGateBanner() {
  const [billing, setBilling] = useState<BillingStatusState>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  useEffect(() => {
    authFetch('/api/billing/status')
      .then(r => r.json())
      .then(data => {
        if (data.success) setBilling({ hasAccess: data.data.has_access, status: data.data.status })
      })
      .catch(() => {})
  }, [])

  const handlePortal = async () => {
    setPortalLoading(true)
    setPortalError(null)
    try {
      const res = await authFetch('/api/billing/portal', { method: 'POST' })
      const json = await res.json()
      if (json.success && json.url) {
        window.location.href = json.url
        return
      }
      setPortalError(json.error ?? 'Impossible d\'ouvrir le portail Stripe')
    } catch {
      setPortalError('Erreur réseau')
    } finally {
      setPortalLoading(false)
    }
  }

  if (!billing) return null

  if (billing.status === 'past_due') {
    return (
      <div style={{
        background: 'linear-gradient(90deg, #b45309 0%, #f59e0b 100%)',
        color: '#fff',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        flexWrap: 'wrap',
        fontSize: 14,
        fontWeight: 500,
      }}>
        <span>⚠️ Paiement en retard — mettez à jour votre moyen de paiement pour ne pas perdre l&apos;accès.</span>
        <button
          type="button"
          onClick={handlePortal}
          disabled={portalLoading}
          style={{
            background: '#fff',
            color: '#b45309',
            padding: '6px 16px',
            borderRadius: 8,
            fontWeight: 700,
            border: 'none',
            cursor: portalLoading ? 'default' : 'pointer',
            fontSize: 13,
          }}
        >
          {portalLoading ? 'Ouverture…' : 'Mettre à jour mon paiement'}
        </button>
        {portalError && <span style={{ fontSize: 12 }}>{portalError}</span>}
      </div>
    )
  }

  if (!billing.hasAccess) {
    return (
      <div style={{
        background: 'linear-gradient(90deg, #1e3a8a 0%, #3b7ef6 100%)',
        color: '#fff',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        flexWrap: 'wrap',
        fontSize: 14,
        fontWeight: 500,
      }}>
        <span>Abonnement requis pour utiliser Operis.</span>
        <Link
          href="/settings/billing"
          style={{
            background: '#fff',
            color: '#1e3a8a',
            padding: '6px 16px',
            borderRadius: 8,
            fontWeight: 700,
            textDecoration: 'none',
            fontSize: 13,
          }}
        >
          S&apos;abonner
        </Link>
      </div>
    )
  }

  return null
}
