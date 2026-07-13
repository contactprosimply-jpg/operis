'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { setAccessToken } from '@/lib/auth-client'
import { markAuthBootstrapped, syncAuthSessionSilent } from '@/lib/auth-session-store'
import { POST_AUTH_ROUTE } from '@/lib/public-routes'
import { Spinner } from '@/components/ui'
import { OperisLogoMark } from '@/components/OperisLogoMark'

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

  // Lien de confirmation d'email (ou de récupération de mot de passe) : Supabase redirige
  // ici avec les tokens de session dans le hash de l'URL (#access_token=...&type=signup).
  // Le client Supabase n'est créé que paresseusement (voir src/lib/supabase.ts) — sans ce
  // getSession(), rien ne déclenche jamais le traitement de ce hash et le lien "ne fait rien".
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session: hashSession } }) => {
      if (!mounted || !hashSession) return
      setAccessToken(hashSession.access_token)
      markAuthBootstrapped(hashSession)
      syncAuthSessionSilent(hashSession)
      const redirect = searchParams.get('redirect')
      const safeRedirect = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : POST_AUTH_ROUTE
      router.push(safeRedirect)
      router.refresh()
    })
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    setAccessToken(data.session.access_token)
    markAuthBootstrapped(data.session)
    syncAuthSessionSilent(data.session)

    const redirect = searchParams.get('redirect')
    const safeRedirect = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : POST_AUTH_ROUTE
    router.push(safeRedirect)
    router.refresh()
  }

  return (
    <div className="animate-fade-in" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(79,142,247,0.15), transparent), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(129,140,248,0.08), transparent)',
      padding: '0 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <OperisLogoMark size={52} glow />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            Operis
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            La gestion AO pour les pros du BTP
          </p>
        </div>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
          borderRadius: 16, padding: '32px 28px', boxShadow: 'var(--shadow-md)',
        }}>
          <form onSubmit={handleLogin} autoComplete="on">
            {error && (
              <div style={{
                background: 'var(--danger-soft)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 9, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#f87171',
              }}>
                {error}
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Email</label>
              <input
                type="email" name="email" autoComplete="username"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="ton@email.fr" required
                style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 9, padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'DM Sans, system-ui' }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px var(--accent-soft)' }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border-hi)'; (e.target as HTMLInputElement).style.boxShadow = 'none' }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Mot de passe</label>
              <input
                type="password" name="password" autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 9, padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'DM Sans, system-ui' }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px var(--accent-soft)' }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border-hi)'; (e.target as HTMLInputElement).style.boxShadow = 'none' }}
              />
            </div>
            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', background: loading ? 'rgba(79,142,247,0.4)' : 'var(--gradient-primary)',
                color: '#fff', border: 'none', borderRadius: 9, padding: '13px',
                fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, system-ui', boxShadow: loading ? 'none' : 'var(--shadow-glow)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              {loading && <Spinner size={14} />}
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pas encore de compte ? </span>
            <a href={`/signup${searchParams.get('redirect') ? `?redirect=${encodeURIComponent(searchParams.get('redirect')!)}` : ''}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Créer un compte</a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}><Spinner size={28} /></div>}>
      <LoginForm />
    </Suspense>
  )
}
