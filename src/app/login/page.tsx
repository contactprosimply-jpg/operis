'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Card, Spinner } from '@/components/ui'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) setEmail(decodeURIComponent(emailParam))
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.session) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    const redirect = searchParams.get('redirect')
    const safeRedirect = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/dashboard'
    window.location.href = safeRedirect
  }

  return (
    <div className="animate-fade-in ds-auth-shell">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div className="ds-auth-logo">OP</div>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            Operis
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            La gestion AO pour les pros du BTP
          </p>
        </div>
        <Card hover={false} style={{ padding: '32px 28px' }}>
          <form onSubmit={handleLogin} autoComplete="on">
            {error && (
              <div style={{
                background: 'var(--danger-soft)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#f87171',
              }}>
                {error}
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label className="ds-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="ds-input"
                type="email" name="email" autoComplete="username"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="ton@email.fr" required
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label className="ds-label" htmlFor="login-password">Mot de passe</label>
              <input
                id="login-password"
                className="ds-input"
                type="password" name="password" autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
              />
            </div>
            <Button type="submit" variant="primary" size="lg" loading={loading} className="ds-btn--block">
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pas encore de compte ? </span>
            <a href={`/register${searchParams.get('redirect') ? `?redirect=${encodeURIComponent(searchParams.get('redirect')!)}` : ''}`} style={{ fontSize: 12, color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600 }}>Créer un compte</a>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="ds-auth-shell"><Spinner size={28} /></div>}>
      <LoginForm />
    </Suspense>
  )
}
