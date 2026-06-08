'use client'

import { useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui'

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
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)',
    borderRadius: 9, padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'DM Sans, system-ui',
  }

  const pageBg: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-primary)',
    backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(79,142,247,0.15), transparent)',
    padding: '0 16px',
  }

  if (success) {
    return (
      <div className="animate-fade-in" style={pageBg}>
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
          <a href="/login" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            Retour à la connexion →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in" style={pageBg}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, background: 'var(--gradient-primary)', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'DM Mono, monospace', fontSize: 17, fontWeight: 700, color: '#fff',
            boxShadow: 'var(--shadow-glow)',
          }}>OP</div>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Créer un compte</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Operis — La gestion AO pour les pros du BTP</p>
        </div>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
          borderRadius: 16, padding: '32px 28px', boxShadow: 'var(--shadow-md)',
        }}>
          <form onSubmit={handleRegister}>
            {error && (
              <div style={{
                background: 'var(--danger-soft)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 9, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#f87171',
              }}>{error}</div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Nom complet</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Uros Nikodex" required style={{ ...inputStyle, borderColor: fullName && !nameValid ? '#ef4444' : undefined }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ton@email.fr" required style={{ ...inputStyle, borderColor: email && !emailValid ? '#ef4444' : undefined }} />
            </div>
            <div style={{ marginBottom: 24 }}>
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
            <button type="submit" disabled={loading} style={{
              width: '100%', background: loading ? 'rgba(79,142,247,0.4)' : 'var(--gradient-primary)',
              color: '#fff', border: 'none', borderRadius: 9, padding: '13px',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : 'var(--shadow-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {loading && <Spinner size={14} />}
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Déjà un compte ? </span>
            <a href="/login" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Se connecter</a>
          </div>
        </div>
      </div>
    </div>
  )
}
