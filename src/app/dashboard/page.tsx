'use client'

export const dynamic = 'force-dynamic'

import { useRouter } from 'next/navigation'
import { useTenders } from '@/hooks'
import { KpiCard, TenderStatusBadge, Badge, Spinner, useToast } from '@/components/ui'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Email } from '@/types/database'

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

export default function DashboardPage() {
  const router = useRouter()
  const { tenders, loading } = useTenders()
  const { show, ToastComponent } = useToast()
  const [emails, setEmails] = useState<Email[]>([])
  const [creatingAo, setCreatingAo] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const token = await getToken()
      const res = await fetch('/api/mail/emails?ao=true', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) setEmails(data.data.filter((e: Email) => !e.tender_id))
    }
    load()
  }, [])

  const handleCreateAo = async (email: Email) => {
    setCreatingAo(email.id)
    try {
      const token = await getToken()
      const res = await fetch(`/api/mail/emails/${email.id}/ao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        show('AO cree avec succes')
        router.push(`/tenders/${data.data.tender_id}`)
      } else {
        show(`Erreur : ${data.error}`)
      }
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
    <div>
      {ToastComponent}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <KpiCard label="AO actifs" value={actifs.length}
          delta={urgents.length > 0 ? `${urgents.length} urgent(s)` : 'Aucune urgence'}
          deltaVariant={urgents.length > 0 ? 'danger' : 'success'} />
        <KpiCard label="Taux reponse" value={`${tauxReponse}%`}
          delta={`${totalResp}/${totalSupp} fournisseurs`} />
        <KpiCard label="Devis recus" value={totalDevis}
          delta={emails.length > 0 ? `${emails.length} emails AO` : 'Tout traite'}
          deltaVariant={emails.length > 0 ? 'warn' : 'success'} />
        <KpiCard label="Taux reussite" value={`${tauxReussite}%`}
          delta={`${gagnes} AO gagnes`} deltaVariant="success" />
      </div>

      {/* Urgences */}
      {urgents.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}>
            Urgences — deadline dans moins de 3 jours
          </div>
          {urgents.map(t => (
            <div key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', cursor: 'pointer' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{t.title}</span>
              <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#f87171' }}>{t.days_remaining}j</span>
              <Badge color={t.nb_responses > 0 ? 'amber' : 'red'}>{t.nb_responses}/{t.nb_suppliers}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* AO en cours */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>
          AO en cours
        </span>
        <button onClick={() => router.push('/tenders')} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Voir tous →
        </button>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Titre', 'Client', 'Deadline', 'Statut', 'Fournisseurs', 'Reponses'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {actifs.slice(0, 7).map(t => {
              const respPct = t.nb_suppliers > 0 ? Math.round((t.nb_responses / t.nb_suppliers) * 100) : 0
              return (
                <tr key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <td style={{ padding: '11px 14px', fontWeight: 500 }}>{t.title}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-secondary)' }}>{t.client}</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: t.days_remaining !== null && t.days_remaining <= 3 ? '#f87171' : 'var(--text-secondary)' }}>
                    {t.days_remaining !== null ? `${t.days_remaining}j` : '—'}
                  </td>
                  <td style={{ padding: '11px 14px' }}><TenderStatusBadge status={t.status} /></td>
                  <td style={{ padding: '11px 14px' }}><Badge>{t.nb_suppliers}</Badge></td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge color={respPct === 100 ? 'green' : respPct >= 50 ? 'amber' : t.nb_suppliers > 0 ? 'red' : 'gray'}>
                      {t.nb_responses}/{t.nb_suppliers}
                    </Badge>
                  </td>
                </tr>
              )
            })}
            {actifs.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                Aucun AO en cours —{' '}
                <button onClick={() => router.push('/tenders')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  creer un AO
                </button>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Emails AO */}
      {emails.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>
              Emails AO detectes ({emails.length})
            </span>
            <button onClick={() => router.push('/mail')} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Voir tous →
            </button>
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {emails.slice(0, 6).map(email => (
              <div key={email.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fbbf24', fontFamily: 'DM Mono, monospace', flexShrink: 0 }}>AO</div>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => router.push('/mail')}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.subject}</div>
                  <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.from_address}</div>
                </div>
                <Badge color={email.ao_score >= 60 ? 'amber' : 'blue'}>Score {email.ao_score}</Badge>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCreateAo(email) }}
                  disabled={creatingAo === email.id}
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: creatingAo === email.id ? 0.5 : 1, fontFamily: 'DM Sans, system-ui' }}
                >
                  {creatingAo === email.id ? '...' : '+ Creer AO'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
