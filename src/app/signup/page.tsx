'use client'

import { useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { setAccessToken } from '@/lib/auth-client'
import { markAuthBootstrapped, syncAuthSessionSilent } from '@/lib/auth-session-store'
import { Spinner } from '@/components/ui'

const TERMS_VERSION = '1.0'

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

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')
  const safeRedirect = redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/dashboard'
  const loginHref = redirect
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : '/login'

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  const strength = useMemo(() => passwordStrength(password), [password])
  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!firstName.trim() || !lastName.trim()) {
      setError('Prénom et nom requis')
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
    if (password !== passwordConfirm) {
      setError('Les mots de passe ne correspondent pas')
      setLoading(false)
      return
    }
    if (companyName.trim().length < 2) {
      setError('Nom de l\'entreprise requis')
      setLoading(false)
      return
    }
    if (!termsAccepted) {
      setError('Vous devez accepter les conditions d\'utilisation')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          password,
          password_confirm: passwordConfirm,
          company_name: companyName.trim(),
          terms_accepted: true,
        }),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? 'Inscription impossible')
        setLoading(false)
        return
      }

      if (json.data?.needs_email_confirmation) {
        setNeedsConfirmation(true)
        setLoading(false)
        return
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError || !data.session) {
        setNeedsConfirmation(true)
        setLoading(false)
        return
      }

      setAccessToken(data.session.access_token)
      markAuthBootstrapped(data.session)
      syncAuthSessionSilent(data.session)
      router.push(safeRedirect)
      router.refresh()
    } catch {
      setError('Erreur réseau — réessayez')
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)',
    borderRadius: 9, padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'DM Sans, system-ui',
  }

  const pageBg: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-primary)',
    backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(2,18,70,0.12), transparent)',
    padding: '24px 16px',
  }

  if (needsConfirmation) {
    return (
      <div className="animate-fade-in" style={pageBg}>
        <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div style={{
            width: 52, height: 52, background: 'rgba(2,18,70,0.08)', border: '1px solid rgba(2,18,70,0.15)',
            borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
            fontSize: 24,
          }}>✉</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#021246', marginBottom: 8 }}>Vérifiez votre email</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
            Un lien de confirmation a été envoyé à <strong>{email}</strong>. Cliquez dessus pour activer votre compte, puis connectez-vous.
          </p>
          <a href={loginHref} style={{ fontSize: 13, color: '#021246', textDecoration: 'none', fontWeight: 600 }}>
            Aller à la connexion →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in" style={pageBg}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, background: '#021246', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'DM Mono, monospace', fontSize: 17, fontWeight: 700, color: '#fff',
          }}>OP</div>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#021246', margin: '0 0 8px' }}>Créer un compte</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Operis — Gestion AO pour le BTP</p>
        </div>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
          borderRadius: 16, padding: '32px 28px', boxShadow: 'var(--shadow-md)',
        }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: 'var(--danger-soft)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 9, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#f87171',
              }}>{error}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Prénom</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Nom</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ton@email.fr" required style={{ ...inputStyle, borderColor: email && !emailValid ? '#ef4444' : undefined }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Entreprise / Famille</label>
              <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Mon entreprise BTP" required style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" required style={inputStyle} />
              {password && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${strength.score}%`, background: strength.color, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: strength.color, marginTop: 4, fontFamily: 'DM Mono, monospace' }}>{strength.label}</div>
                </div>
              )}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Confirmer le mot de passe</label>
              <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} required style={{ ...inputStyle, borderColor: passwordConfirm && passwordConfirm !== password ? '#ef4444' : undefined }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} required style={{ marginTop: 3, minWidth: 16, minHeight: 16 }} />
              <span>
                J&apos;accepte les{' '}
                <a href="/legal#cgu" target="_blank" rel="noopener noreferrer" style={{ color: '#021246' }}>CGU</a>,{' '}
                <a href="/legal#cgv" target="_blank" rel="noopener noreferrer" style={{ color: '#021246' }}>CGV</a>{' '}
                et la{' '}
                <a href="/legal#confidentialite" target="_blank" rel="noopener noreferrer" style={{ color: '#021246' }}>Politique de confidentialité</a>
                {' '}(v{TERMS_VERSION})
              </span>
            </label>
            <button type="submit" disabled={loading || !termsAccepted} style={{
              width: '100%', background: loading ? 'rgba(2,18,70,0.4)' : '#021246',
              color: '#fff', border: 'none', borderRadius: 9, padding: '13px',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {loading && <Spinner size={14} />}
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Déjà client ? </span>
            <a href={loginHref} style={{ fontSize: 12, color: '#021246', textDecoration: 'none', fontWeight: 600 }}>Se connecter</a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>}>
      <SignupForm />
    </Suspense>
  )
}
