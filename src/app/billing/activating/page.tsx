'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/auth-client'
import { Button, Spinner } from '@/components/ui'
import { OperisLogoMark } from '@/components/OperisLogoMark'

const POLL_INTERVAL_MS = 2000
const MAX_ATTEMPTS = 30 // ~60 s — filet de sécurité si Stripe/le webhook est anormalement lent

function BillingActivatingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
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
        // Vérification directe de la session Stripe payée — ne dépend pas du délai du
        // webhook, qui reste un filet de sécurité en arrière-plan pour les renouvellements.
        if (sessionId) {
          await authFetch(`/api/billing/confirm-session?session_id=${encodeURIComponent(sessionId)}`).catch(() => null)
        }

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
  }, [router, refreshBillingAccess, sessionId])

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
        <div style={{ margin: '0 auto 24px', width: 52 }}>
          <OperisLogoMark size={52} glow />
        </div>

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
              Activation plus longue que prévu
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 24 }}>
              Votre paiement a bien été reçu par Stripe, mais l&apos;activation prend plus de temps que
              prévu côté serveur. Réessayez, ou rendez-vous directement sur votre espace — l&apos;accès
              se débloquera automatiquement dès que l&apos;activation sera terminée.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="ghost" onClick={() => window.location.reload()}>
                Réessayer
              </Button>
              <Button onClick={() => router.replace('/dashboard')}>
                Aller à mon espace →
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function BillingActivatingPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <Spinner size={28} />
      </div>
    }>
      <BillingActivatingContent />
    </Suspense>
  )
}
