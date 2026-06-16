'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-client'
import { Spinner } from '@/components/ui'
import type { BillingPlan } from '@/lib/billing/plan-limits'

type BillingStatus = {
  in_trial: boolean
  plan: BillingPlan | null
  limits: { seats: number; storageGb: number }
  usage: { seats: number; storage_gb: number }
}

function planLabel(data: BillingStatus): string {
  if (data.plan === 'business') return 'Business'
  if (data.plan === 'pro') return 'Pro'
  if (data.in_trial) return 'Essai gratuit'
  return 'Aucun abonnement'
}

export default function BillingSummarySection() {
  const [data, setData] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authFetch('/api/billing/status')
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'center',
      }}>
        <Spinner size={20} />
      </div>
    )
  }

  if (!data) return null

  const remainingGb = Math.max(0, Number((data.limits.storageGb - data.usage.storage_gb).toFixed(2)))
  const usedGb = data.usage.storage_gb

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '18px 20px', marginBottom: 16,
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Abonnement
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {planLabel(data)}
            {data.in_trial && data.plan && (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 8 }}>
                (essai 14 jours)
              </span>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Stockage restant
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {remainingGb} Go
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {' '}/ {data.limits.storageGb} Go
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {usedGb} Go utilisés
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Utilisateurs
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {data.usage.seats} / {data.limits.seats}
          </div>
        </div>
      </div>
      <Link
        href="/settings/billing"
        style={{
          fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none',
          padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(59,130,246,0.35)',
          background: 'var(--accent-soft)',
        }}
      >
        Gérer l&apos;abonnement →
      </Link>
    </div>
  )
}
