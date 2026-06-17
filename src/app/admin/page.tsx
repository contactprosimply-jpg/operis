'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken } from '@/lib/auth-client'
import { useAuth } from '@/components/AuthProvider'
import { Spinner } from '@/components/ui'

const ADMIN_EMAIL = 'contact@nikodex.fr'

function timeSince(dateStr: string | null) {
  if (!dateStr) return 'Jamais'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor(diff / 60000)
  if (days > 30) return `${Math.floor(days / 30)}m`
  if (days > 0) return `${days}j`
  if (hours > 0) return `${hours}h`
  return `${mins}min`
}

export default function AdminPage() {
  const router = useRouter()
  const { session } = useAuth()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [stats, setStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkingAlerts, setCheckingAlerts] = useState(false)
  const [alertsMsg, setAlertsMsg] = useState<string | null>(null)
  const [syncHealth, setSyncHealth] = useState<any>(null)
  const [syncHealthLoading, setSyncHealthLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      if (!session) { router.push('/login'); return }
      if (session.user.email !== ADMIN_EMAIL) {
        setAuthorized(false)
        setLoading(false)
        return
      }
      setAuthorized(true)

      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) {
        setStats(data.data.sort((a: any, b: any) => b.ao_actifs - a.ao_actifs))
      } else {
        setError(data.error)
      }
      setLoading(false)

      try {
        const healthRes = await fetch('/api/admin/sync-health', { headers: { Authorization: `Bearer ${token}` } })
        const healthData = await healthRes.json()
        if (healthData.success) setSyncHealth(healthData.data)
      } catch {
        /* ignore */
      }
      setSyncHealthLoading(false)
    }
    init()
  }, [router, session])

  const handleCheckAlerts = async () => {
    setCheckingAlerts(true)
    setAlertsMsg(null)
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/alerts/check', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setAlertsMsg(`✓ ${data.data.notifications_created} nouvelle(s) notification(s) créée(s)`)
      } else {
        setAlertsMsg(`Erreur : ${data.error}`)
      }
    } catch (e: any) {
      setAlertsMsg(`Erreur : ${e.message}`)
    }
    setCheckingAlerts(false)
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }
  const label: React.CSSProperties = { fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <Spinner size={28} />
    </div>
  )

  if (authorized === false) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Accès réservé</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cette page est réservée à l'administrateur Operis.</div>
      <button onClick={() => router.push('/dashboard')} style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
        ← Retour au dashboard
      </button>
    </div>
  )

  if (error) return (
    <div style={{ padding: 24, color: '#f87171', fontSize: 13 }}>Erreur : {error}</div>
  )

  const totalUsers = stats.length
  const totalAoActifs = stats.reduce((a, s) => a + s.ao_actifs, 0)
  const totalDevis = stats.reduce((a, s) => a + s.devis_recus, 0)
  const totalEmails = stats.reduce((a, s) => a + s.emails_envoyes, 0)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: 'DM Mono, monospace' }}>A</div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Dashboard Admin</h1>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vue globale de tous les utilisateurs Operis</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button
            onClick={handleCheckAlerts}
            disabled={checkingAlerts}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: checkingAlerts ? 'not-allowed' : 'pointer', background: checkingAlerts ? 'var(--bg-hover)' : 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontFamily: 'DM Sans, system-ui', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.12s' }}
          >
            {checkingAlerts ? '⏳ Vérification...' : '🔔 Vérifier les alertes'}
          </button>
          {alertsMsg && (
            <div style={{ fontSize: 11, color: alertsMsg.startsWith('✓') ? '#4ade80' : '#f87171', fontFamily: 'DM Mono, monospace' }}>
              {alertsMsg}
            </div>
          )}
        </div>
      </div>

      {/* KPIs globaux */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Utilisateurs', value: totalUsers, color: '#60a5fa' },
          { label: 'AO actifs', value: totalAoActifs, color: '#fbbf24' },
          { label: 'Devis reçus', value: totalDevis, color: '#4ade80' },
          { label: 'Emails envoyés', value: totalEmails, color: '#a78bfa' },
        ].map(k => (
          <div key={k.label} style={card}>
            <div style={{ ...label, marginBottom: 10 }}>{k.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: k.color, fontFamily: 'DM Mono, monospace' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Santé du sync mail */}
      <div style={{
        ...card,
        marginBottom: 28,
        background: 'linear-gradient(135deg, #021246 0%, #06205c 100%)',
        border: '1px solid rgba(30,203,225,0.25)',
        color: '#e2e8f0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Santé du sync mail</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Cron Vercel · /api/cron/sync-mail · toutes les 5 min</div>
          </div>
          {syncHealth?.in_progress && (
            <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(30,203,225,0.15)', color: '#1ECBE1', fontFamily: 'DM Mono, monospace' }}>
              sync en cours…
            </span>
          )}
        </div>
        {syncHealthLoading ? (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Chargement…</div>
        ) : !syncHealth?.last_run ? (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Aucun run enregistré (migration 028 ou premier cron).</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 16 }}>
              <div>
                <div style={{ ...label, color: '#64748b' }}>Dernière sync OK</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1ECBE1', fontFamily: 'DM Mono, monospace' }}>
                  {syncHealth.minutes_since_success != null
                    ? `${syncHealth.minutes_since_success} min`
                    : '—'}
                </div>
              </div>
              <div>
                <div style={{ ...label, color: '#64748b' }}>Statut dernier run</div>
                <div style={{
                  fontSize: 14, fontWeight: 700, fontFamily: 'DM Mono, monospace',
                  color: syncHealth.last_run?.status === 'success' ? '#4ade80'
                    : syncHealth.last_run?.status === 'partial' ? '#fbbf24' : '#f87171',
                }}>
                  {syncHealth.last_run?.status ?? '—'}
                </div>
              </div>
              <div>
                <div style={{ ...label, color: '#64748b' }}>Nouveaux mails</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: 'DM Mono, monospace' }}>
                  {syncHealth.last_run?.new_emails ?? 0}
                </div>
              </div>
              <div>
                <div style={{ ...label, color: '#64748b' }}>Comptes sync</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: 'DM Mono, monospace' }}>
                  {syncHealth.last_run?.accounts_synced ?? 0}
                </div>
              </div>
            </div>
            {syncHealth.recent_errors?.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#f87171', marginBottom: 8, textTransform: 'uppercase' }}>
                  Derniers runs en erreur
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {syncHealth.recent_errors.slice(0, 5).map((run: any) => (
                    <div key={run.id} style={{ fontSize: 11, color: '#cbd5e1', fontFamily: 'DM Mono, monospace' }}>
                      {new Date(run.finished_at ?? run.started_at).toLocaleString('fr-FR')}
                      · {run.new_emails} mails · {run.duration_ms ?? 0} ms
                      {run.error_detail?.fatal && ` · ${run.error_detail.fatal}`}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Table membres */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Activité par utilisateur</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Utilisateur', 'AO actifs', 'AO total', 'Taux réussite', 'Emails envoyés', 'Devis reçus', 'Emails sync', 'Dernière co.', 'Inscription'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map(s => {
                const isAdmin = s.email === ADMIN_EMAIL
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', background: isAdmin ? 'rgba(59,126,246,0.03)' : 'transparent' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: isAdmin ? 'var(--accent)' : '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {(s.display_name || s.email || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {s.display_name !== s.email ? s.display_name : ''}
                            {isAdmin && <span style={{ fontSize: 9, marginLeft: 6, background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '1px 5px', fontFamily: 'DM Mono, monospace' }}>ADMIN</span>}
                          </div>
                          <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: s.ao_actifs > 0 ? '#60a5fa' : 'var(--text-muted)' }}>{s.ao_actifs}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>{s.ao_total}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: s.taux_reussite >= 50 ? '#4ade80' : s.taux_reussite >= 25 ? '#fbbf24' : 'var(--text-muted)' }}>
                        {s.taux_reussite}%
                      </span>
                      <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 3 }}>
                        <div style={{ width: `${Math.min(100, s.taux_reussite)}%`, height: '100%', background: s.taux_reussite >= 50 ? '#4ade80' : s.taux_reussite >= 25 ? '#fbbf24' : '#f87171', borderRadius: 2 }} />
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)' }}>{s.emails_envoyes}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono, monospace', color: s.devis_recus > 0 ? '#4ade80' : 'var(--text-muted)' }}>{s.devis_recus}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', fontSize: 11 }}>{s.emails_sync}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                      {s.last_sign_in_at ? (
                        <span title={new Date(s.last_sign_in_at).toLocaleString('fr-FR')}>
                          {timeSince(s.last_sign_in_at)}
                        </span>
                      ) : 'Jamais'}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(s.created_at).toLocaleDateString('fr-FR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
