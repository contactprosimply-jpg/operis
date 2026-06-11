'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/auth-client'
import { Button, Spinner } from '@/components/ui'

type InvitePreview = {
  organization_name: string
  owner_email: string | null
  owner_name: string | null
  member_count: number
}

export default function JoinGroupPage() {
  const params = useParams()
  const token = params.token as string
  const router = useRouter()
  const { session, ready } = useAuth()

  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  const redirectPath = `/join/${token}`

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/organization/invite/${token}`)
        const data = await res.json()
        if (!data.success) {
          setError(data.error ?? 'Lien invalide')
          setPreview(null)
        } else {
          setPreview(data.data)
        }
      } catch {
        setError('Impossible de charger l\'invitation')
      }
      setLoading(false)
    }
    load()
  }, [token])

  const handleJoin = async () => {
    setJoining(true)
    setError(null)
    try {
      const res = await authFetch(`/api/organization/invite/${token}`, { method: 'POST' })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Impossible de rejoindre le groupe')
        setJoining(false)
        return
      }
      setJoined(true)
      setTimeout(() => router.push('/settings?tab=famille'), 1200)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err.message ?? 'Erreur reseau')
      setJoining(false)
    }
  }

  const creatorLabel = preview?.owner_name?.trim() || preview?.owner_email || 'un membre Operis'

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(79,142,247,0.15), transparent)',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, background: 'var(--gradient-primary)', borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'DM Mono, monospace', fontSize: 17, fontWeight: 700, color: '#fff',
            boxShadow: 'var(--shadow-glow)',
          }}>OP</div>
        </div>

        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
          borderRadius: 16, padding: '28px 24px', boxShadow: 'var(--shadow-md)',
        }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Spinner size={28} />
            </div>
          ) : error && !preview ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                Invitation invalide
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{error}</p>
              <Link href="/login" style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Retour a Operis</Link>
            </div>
          ) : joined ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#4ade80', marginBottom: 8 }}>
                Vous faites partie du groupe !
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Redirection vers les parametres...</p>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{
                  fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
                }}>
                  Invitation Famille
                </div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                  {preview?.organization_name}
                </h1>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Cree par <strong>{creatorLabel}</strong>
                  {preview && preview.member_count > 0 && (
                    <> — {preview.member_count} membre{preview.member_count > 1 ? 's' : ''}</>
                  )}
                </p>
              </div>

              {!ready || !session ? (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 20, lineHeight: 1.5 }}>
                    Connectez-vous avec le compte Operis que vous souhaitez rattacher a ce groupe.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Link
                      href={`/login?redirect=${encodeURIComponent(redirectPath)}`}
                      style={{
                        display: 'block', textAlign: 'center', padding: '12px 16px',
                        background: 'var(--gradient-primary)', color: '#fff', borderRadius: 9,
                        fontSize: 14, fontWeight: 600, textDecoration: 'none',
                      }}
                    >
                      Se connecter
                    </Link>
                    <Link
                      href={`/register?redirect=${encodeURIComponent(redirectPath)}`}
                      style={{
                        display: 'block', textAlign: 'center', padding: '12px 16px',
                        border: '1px solid var(--border-hi)', color: 'var(--text-secondary)',
                        borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                      }}
                    >
                      Creer un compte Operis
                    </Link>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{
                    padding: '12px 14px', borderRadius: 10, marginBottom: 16,
                    background: 'var(--accent-soft)', border: '1px solid rgba(79,142,247,0.25)',
                    fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5,
                  }}>
                    Voulez-vous rejoindre le groupe <strong>{preview?.organization_name}</strong> avec
                    <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--accent)' }}> {session.user.email}</span> ?
                  </div>
                  {error && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                      background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: 12,
                    }}>
                      {error}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Button variant="primary" loading={joining} onClick={handleJoin} style={{ flex: 1 }}>
                      Oui, rejoindre
                    </Button>
                    <Button variant="ghost" onClick={() => router.push('/dashboard')} style={{ flex: 1 }}>
                      Non
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
