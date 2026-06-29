'use client'

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Spinner, Button, Card } from '@/components/ui'

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: 'var(--border)' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 2) return { score: 33, label: 'Faible', color: '#ef4444' }
  if (score <= 3) return { score: 66, label: 'Moyen', color: '#f59e0b' }
  return { score: 100, label: 'Fort', color: '#10b981' }
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="ds-auth-shell"><Spinner size={28} /></div>}>
      <RegisterForm />
    </Suspense>
  )
}

function RegisterForm() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const safeRedirect = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : null
  const loginHref = safeRedirect
    ? `/login?redirect=${encodeURIComponent(safeRedirect)}`
    : '/login'

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [termsAccepted, setTermsAccepted] = useState(false)
  const TERMS_VERSION = '1.0'

  const strength = useMemo(() => passwordStrength(password), [password])
  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const nameValid = fullName.trim().length >= 2

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!nameValid) {
      setError('Le nom doit contenir au moins 2 caractères')
      setLoading(false)
      return
    }
    if (!emailValid) {
      setError('Email invalide')
      setLoading(false)
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      setLoading(false)
      return
    }
    if (!termsAccepted) {
      setError('Vous devez accepter les CGU, CGV et la Politique de confidentialité')
      setLoading(false)
      return
    }

    const acceptedAt = new Date().toISOString()
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          terms_accepted_at: acceptedAt,
          terms_version: TERMS_VERSION,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (signUpData.session) {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terms_accepted_at: acceptedAt,
          terms_version: TERMS_VERSION,
        }),
      }).catch(() => null)
    }

    setSuccess(true)
    setLoading(false)
  }

  const invalidBorder = (invalid: boolean): React.CSSProperties | undefined =>
    invalid ? { borderColor: '#ef4444' } : undefined

  if (success) {
    return (
      <div className="animate-fade-in ds-auth-shell">
        <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div style={{
            width: 52, height: 52, background: 'var(--success-soft)', border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Compte créé !</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
            Vérifie ta boîte mail et clique sur le lien de confirmation.
          </p>
          <a href={loginHref} style={{ fontSize: 13, color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600 }}>
            Retour à la connexion →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in ds-auth-shell">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div className="ds-auth-logo">OP</div>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Créer un compte</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Operis — La gestion AO pour les pros du BTP</p>
        </div>
        <Card hover={false} style={{ padding: '32px 28px' }}>
          <form onSubmit={handleRegister}>
            {error && (
              <div style={{
                background: 'var(--danger-soft)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#f87171',
              }}>{error}</div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label className="ds-label">Nom complet</label>
              <input type="text" className="ds-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Uros Nikodex" required style={invalidBorder(!!fullName && !nameValid)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="ds-label">Email</label>
              <input type="email" className="ds-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="ton@email.fr" required style={invalidBorder(!!email && !emailValid)} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label className="ds-label">Mot de passe</label>
              <input type="password" className="ds-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" required />
              {password && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${strength.score}%`, background: strength.color, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: strength.color, marginTop: 4, fontFamily: 'DM Mono, monospace' }}>{strength.label}</div>
                </div>
              )}
            </div>
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20,
              fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                required
                style={{ marginTop: 3, minWidth: 16, minHeight: 16, cursor: 'pointer' }}
              />
              <span>
                J&apos;ai lu et j&apos;accepte les{' '}
                <a href="/legal#cgu" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>CGU</a>
                {', les '}
                <a href="/legal#cgv" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>CGV</a>
                {' et la '}
                <a href="/legal#confidentialite" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>Politique de confidentialité</a>
              </span>
            </label>
            <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!termsAccepted} className="ds-btn--block">
              {loading ? 'Création...' : 'Créer mon compte'}
            </Button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Déjà un compte ? </span>
            <a href={loginHref} style={{ fontSize: 12, color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600 }}>Se connecter</a>
          </div>
        </Card>
      </div>
    </div>
  )
}
