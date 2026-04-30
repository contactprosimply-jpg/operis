'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pré-remplir l'email si passé en query param (switch de compte)
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

    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f1117' }}>
      <div className="w-full max-w-md" style={{ padding: '0 16px' }}>
        <div className="flex justify-center mb-8">
          <div style={{ width: 48, height: 48, background: '#3b7ef6', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Mono, monospace', fontSize: 16, fontWeight: 700, color: '#fff' }}>
            OP
          </div>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f1f3f9', margin: '0 0 4px' }}>Connexion à Operis</h1>
          <p style={{ fontSize: 13, color: '#4a5168', margin: 0 }}>Gestion des appels d'offres BTP</p>
        </div>
        <div style={{ background: 'rgba(59,126,246,0.06)', border: '1px solid rgba(59,126,246,0.2)', borderRadius: 16, padding: 32 }}>
          <form onSubmit={handleLogin}>
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#f87171' }}>
                {error}
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#4a5168', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="ton@email.fr" required
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(59,126,246,0.3)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#f1f3f9', outline: 'none', boxSizing: 'border-box', fontFamily: 'DM Sans, system-ui' }}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#3b7ef6'}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(59,126,246,0.3)'}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#4a5168', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Mot de passe</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(59,126,246,0.3)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#f1f3f9', outline: 'none', boxSizing: 'border-box', fontFamily: 'DM Sans, system-ui' }}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = '#3b7ef6'}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(59,126,246,0.3)'}
              />
            </div>
            <button
              type="submit" disabled={loading}
              style={{ width: '100%', background: loading ? 'rgba(59,126,246,0.5)' : '#3b7ef6', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, system-ui', transition: 'background 0.2s' }}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: '#4a5168' }}>Pas encore de compte ? </span>
            <a href="/register" style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none' }}>Créer un compte</a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117' }}><div style={{ color: '#fff' }}>Chargement...</div></div>}>
      <LoginForm />
    </Suspense>
  )
}
