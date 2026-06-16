'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-client'

type BillingStatus = {
  has_access: boolean
  in_trial: boolean
}

export default function BillingGateBanner() {
  const [status, setStatus] = useState<BillingStatus | null>(null)

  useEffect(() => {
    authFetch('/api/billing/status')
      .then(r => r.json())
      .then(data => {
        if (data.success) setStatus(data.data)
      })
      .catch(() => {})
  }, [])

  if (!status || status.has_access) return null

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
      <span>Votre essai est terminé — choisissez une offre pour continuer à utiliser Operis.</span>
      <Link
        href="/pricing"
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
        Choisir une offre
      </Link>
    </div>
  )
}
