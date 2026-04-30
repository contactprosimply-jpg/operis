'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Spinner, Badge } from '@/components/ui'

const ADMIN_EMAIL = 'contact@nikodex.fr'

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      
      if (session.user.email !== ADMIN_EMAIL) {
        setAuthorized(false)
        setLoading(false)
        return
      }

      setAuthorized(true)
      const token = session.access_token
      const res = await fetch('/api/admin', { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json()
      if (json.success) setData(json.data)
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>

  if (!authorized) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 16 }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Accès restreint</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cette page est réservée à l'administrateur.</div>
      <button onClick={() => router.push('/dashboard')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Retour au dashboard</button>
    </div>
  )

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Admin</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Dashboard Administrateur</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{data?.org?.name ?? 'Organisation'}</div>
      </div>

      {/* Stats globales */}
      {data?.global && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'AO total', value: data.global.total_tenders, color: '#60a5fa' },
            { label: 'AO actifs', value: data.global.active_tenders, color: '#fbbf24' },
            { label: 'Emails total', value: data.global.total_emails, color: '#a78bfa' },
            { label: 'Emails non lus', value: data.global.unread_emails, color: '#f87171' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: 'DM Mono, monospace' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Membres */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Membres de la famille</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 20 }}>{data?.members?.length ?? 0} membre(s) dans l'organisation</div>

        {(!data?.members || data.members.length === 0) ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 12 }}>
            Aucun membre — invitez des collaborateurs depuis Settings &gt; Famille
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.members.map((member: any) => {
              const lastSeen = member.stats.last_sign_in
                ? new Date(member.stats.last_sign_in).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                : 'Jamais connecté'

              const winRate = member.stats.total_tenders > 0
                ? Math.round((member.stats.won_tenders / member.stats.total_tenders) * 100)
                : 0

              return (
                <div key={member.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: member.color ?? '#3b7ef6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {(member.display_name ?? member.email ?? '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{member.display_name ?? 'Sans nom'}</div>
                      <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{member.email}</div>
                    </div>
                    <Badge color={member.role === 'admin' ? 'blue' : 'gray'}>{member.role === 'admin' ? 'Admin' : 'Membre'}</Badge>
                  </div>

                  {/* Stats grille */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                    {[
                      { label: 'AO total', value: member.stats.total_tenders, color: '#60a5fa' },
                      { label: 'Actifs', value: member.stats.active_tenders, color: '#fbbf24' },
                      { label: 'Gagnés', value: member.stats.won_tenders, color: '#4ade80' },
                      { label: 'Emails envoyés', value: member.stats.emails_sent, color: '#a78bfa' },
                      { label: 'Devis reçus', value: member.stats.quotes_received, color: '#fb923c' },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'DM Mono, monospace' }}>{s.value}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                      Dernière connexion : <span style={{ color: 'var(--text-secondary)' }}>{lastSeen}</span>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                      Taux de réussite : <span style={{ color: winRate >= 50 ? '#4ade80' : winRate >= 25 ? '#fbbf24' : '#f87171', fontWeight: 600 }}>{winRate}%</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
