'use client'

export const dynamic = 'force-dynamic'

import { useRouter } from 'next/navigation'
import { useTenders } from '@/hooks'
import { KpiCard, TenderStatusBadge, Badge, Spinner, useToast, Card, tableRowHoverHandlers } from '@/components/ui'
import { useState, useEffect } from 'react'
import { authFetch } from '@/lib/auth-client'
import { useAuth } from '@/components/AuthProvider'
import { Email } from '@/types/database'

const IconDoc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
)
const IconChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
)
const IconMail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
  </svg>
)
const IconTrophy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
    <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/>
  </svg>
)

function ResponseBarChart({ pct }: { pct: number }) {
  const bars = [40, 65, 45, 80, 55, pct, 70, 50]
  return (
    <svg viewBox="0 0 200 48" width="100%" height="48" style={{ marginTop: 8 }}>
      {bars.map((h, i) => (
        <rect key={i} x={i * 25 + 4} y={48 - (h / 100) * 40} width="16" height={(h / 100) * 40} rx="3"
          fill={i === 5 ? 'url(#barGrad)' : 'rgba(59,126,246,0.2)'} />
      ))}
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b7ef6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { ready, accessToken } = useAuth()
  const { tenders, loading } = useTenders()
  const { show, ToastComponent } = useToast()
  const [emails, setEmails] = useState<Email[]>([])
  const [creatingAo, setCreatingAo] = useState<string | null>(null)

  useEffect(() => {
    if (!ready || !accessToken) return
    const load = async () => {
      const res = await authFetch('/api/mail/emails?ao=true')
      const data = await res.json()
      if (data.success) setEmails(data.data.filter((e: Email) => !e.tender_id))
    }
    load()
  }, [ready, accessToken])

  const handleCreateAo = async (email: Email) => {
    setCreatingAo(email.id)
    try {
      const res = await authFetch(`/api/mail/emails/${email.id}/ao`, { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      if (data.success) {
        show('AO cree')
        router.push(`/tenders/${data.data.tender_id}`)
      } else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setCreatingAo(null)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>

  const actifs = tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status))
  const urgents = tenders.filter(t => t.days_remaining !== null && t.days_remaining <= 3 && ['nouveau', 'en_cours', 'urgence'].includes(t.status))
  const totalResp = tenders.reduce((a, t) => a + (t.nb_responses ?? 0), 0)
  const totalSupp = tenders.reduce((a, t) => a + (t.nb_suppliers ?? 0), 0)
  const tauxReponse = totalSupp > 0 ? Math.round((totalResp / totalSupp) * 100) : 0
  const totalDevis = tenders.reduce((a, t) => a + (t.nb_quotes ?? 0), 0)
  const gagnes = tenders.filter(t => t.status === 'gagne').length
  const tauxReussite = tenders.length > 0 ? Math.round((gagnes / tenders.length) * 100) : 0

  return (
    <div className="animate-fade">
      {ToastComponent}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <KpiCard label="AO actifs" value={actifs.length} icon={<IconDoc />} color="blue" delay={0}
          delta={urgents.length > 0 ? `${urgents.length} urgent(s)` : 'Aucune urgence'}
          deltaVariant={urgents.length > 0 ? 'danger' : 'success'} />
        <div>
          <KpiCard label="Taux reponse" value={`${tauxReponse}%`} icon={<IconChart />} color="purple" delay={60}
            delta={`${totalResp}/${totalSupp} fournisseurs`} />
          <ResponseBarChart pct={tauxReponse} />
        </div>
        <KpiCard label="Devis recus" value={totalDevis} icon={<IconMail />} color="amber" delay={120}
          delta={emails.length > 0 ? `${emails.length} emails AO` : 'Tout traite'}
          deltaVariant={emails.length > 0 ? 'warn' : 'success'} />
        <KpiCard label="Taux reussite" value={`${tauxReussite}%`} icon={<IconTrophy />} color="green" delay={180}
          delta={`${gagnes} AO gagnes`} deltaVariant="success" />
      </div>

      {urgents.length > 0 && (
        <Card hover={false} style={{ padding: '16px 20px', marginBottom: 22, background: 'var(--danger-soft)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <div style={{ fontSize: 11, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s ease infinite' }} />
            Urgences — deadline dans moins de 3 jours
          </div>
          {urgents.map(t => (
            <div key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
              className="animate-slide"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', cursor: 'pointer' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{t.title}</span>
              <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#f87171', animation: 'pulse 2s ease infinite' }}>{t.days_remaining}j</span>
              <Badge color={t.nb_responses > 0 ? 'amber' : 'red'} glow>{t.nb_responses}/{t.nb_suppliers}</Badge>
            </div>
          ))}
        </Card>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>AO en cours</span>
        <button onClick={() => router.push('/tenders')} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Voir tous →</button>
      </div>

      <Card hover={false} style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Titre', 'Client', 'Deadline', 'Statut', 'Fournisseurs', 'Reponses'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {actifs.slice(0, 7).map((t, i) => {
              const respPct = t.nb_suppliers > 0 ? Math.round((t.nb_responses / t.nb_suppliers) * 100) : 0
              const rowHandlers = tableRowHoverHandlers(t.status)
              return (
                <tr key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
                  className="animate-fade"
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: '3px solid transparent', animationDelay: `${i * 40}ms`, opacity: 0 }}
                  {...rowHandlers}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{t.title}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{t.client}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: t.days_remaining !== null && t.days_remaining <= 3 ? '#f87171' : 'var(--text-secondary)' }}>
                    {t.days_remaining !== null ? `${t.days_remaining}j` : '—'}
                  </td>
                  <td style={{ padding: '12px 14px' }}><TenderStatusBadge status={t.status} /></td>
                  <td style={{ padding: '12px 14px' }}><Badge>{t.nb_suppliers}</Badge></td>
                  <td style={{ padding: '12px 14px' }}>
                    <Badge color={respPct === 100 ? 'green' : respPct >= 50 ? 'amber' : t.nb_suppliers > 0 ? 'red' : 'gray'} glow={respPct === 100}>
                      {t.nb_responses}/{t.nb_suppliers}
                    </Badge>
                  </td>
                </tr>
              )
            })}
            {actifs.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                Aucun AO en cours —{' '}
                <button onClick={() => router.push('/tenders')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>creer un AO</button>
              </td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {emails.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>
              Emails AO detectes ({emails.length})
            </span>
            <button onClick={() => router.push('/mail')} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Voir tous →</button>
          </div>
          <Card hover={false} style={{ padding: 0, overflow: 'hidden' }}>
            {emails.slice(0, 6).map(email => (
              <div key={email.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fbbf24', fontFamily: 'DM Mono, monospace', fontWeight: 700, flexShrink: 0 }}>AO</div>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => router.push('/mail')}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.subject}</div>
                  <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.from_address}</div>
                </div>
                <Badge color={email.ao_score >= 60 ? 'amber' : 'blue'} glow={email.ao_score >= 60}>Score {email.ao_score}</Badge>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCreateAo(email) }}
                  disabled={creatingAo === email.id}
                  style={{ background: 'var(--gradient-1)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: creatingAo === email.id ? 0.5 : 1, fontFamily: 'DM Sans, system-ui', boxShadow: '0 4px 12px rgba(59,126,246,0.3)' }}
                >
                  {creatingAo === email.id ? '...' : '+ Creer AO'}
                </button>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
