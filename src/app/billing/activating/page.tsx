'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/auth-client'
import { Button, Spinner } from '@/components/ui'

const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 10 // ~30 s

export default function BillingActivatingPage() {
  const router = useRouter()
  const { refreshBillingAccess } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    let attempts = 0
    let cancelled = false

    let timer: ReturnType<typeof setTimeout> | undefined

    const check = async () => {
      if (cancelled) return
      attempts += 1

      try {
        const res = await authFetch('/api/billing/status')
        const json = await res.json()
        const active = json.success && json.data?.has_access && json.data?.status === 'active'

        if (active) {
          await refreshBillingAccess()
          router.replace('/dashboard')
          return
        }
      } catch {
        /* session invalide : AuthProvider gère */
      }

      if (attempts >= MAX_ATTEMPTS) {
        setTimedOut(true)
        return
      }

      timer = setTimeout(check, POLL_INTERVAL_MS)
    }

    check()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [router, refreshBillingAccess])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(37,99,235,0.12), transparent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{
          width: 52, height: 52, background: 'var(--gradient-primary)', borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'DM Mono, monospace', fontSize: 17, fontWeight: 700, color: '#fff',
          margin: '0 auto 24px', boxShadow: 'var(--shadow-glow)',
        }}>OP</div>

        {!timedOut ? (
          <>
            <Spinner size={32} />
            <h1 style={{
              fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
              margin: '24px 0 8px',
            }}>
              Activation en cours
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Paiement reçu, activation de votre abonnement en cours…
            </p>
          </>
        ) : (
          <>
            <h1 style={{
              fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
              margin: '0 0 8px',
            }}>
              Activation en cours
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 24 }}>
              L&apos;activation prend plus de temps que prévu, rechargez la page.
            </p>
            <Button onClick={() => window.location.reload()}>
              Recharger
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
