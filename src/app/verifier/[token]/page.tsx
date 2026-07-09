'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Spinner } from '@/components/ui'
import { OperisLogoMark } from '@/components/OperisLogoMark'

export default function VerifyMailPage() {
  const params = useParams()
  const token = params.token as string

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/public/verify-mail/${token}`, { method: 'POST' })
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.success) setStatus('success')
        else {
          setStatus('error')
          setError(json.error ?? 'Lien invalide')
        }
      })
      .catch(() => { if (!cancelled) { setStatus('error'); setError('Erreur réseau') } })
    return () => { cancelled = true }
  }, [token])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(79,142,247,0.15), transparent)',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <OperisLogoMark size={48} />
        </div>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
          borderRadius: 16, padding: '32px 28px', boxShadow: 'var(--shadow-md)',
        }}>
          {status === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <Spinner size={28} />
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Vérification en cours…</p>
            </div>
          )}
          {status === 'success' && (
            <>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: '#4ade80', margin: '0 0 8px' }}>Message transmis</h1>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Merci pour cette vérification. Le message vous a été envoyé, vous pouvez fermer cette page.
              </p>
            </>
          )}
          {status === 'error' && (
            <>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✕</div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Lien invalide</h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{error}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
