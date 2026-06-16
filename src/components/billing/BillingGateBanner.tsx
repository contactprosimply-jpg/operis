'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-client'

export default function BillingGateBanner() {
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    authFetch('/api/billing/status')
      .then(r => r.json())
      .then(data => {
        if (data.success) setBlocked(!data.data.has_access)
      })
      .catch(() => {})
  }, [])

  if (!blocked) return null

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
