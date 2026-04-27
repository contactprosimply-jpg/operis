'use client'
// v3

import { useRouter } from 'next/navigation'
import { useTenders } from '@/hooks'
import { KpiCard, TenderStatusBadge, Badge, Spinner } from '@/components/ui'
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
  const [emails, setEmails] = useState<Email[]>([])
  const [creatingAo, setCreatingAo] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

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
        showToast('AO cree !')
        router.push(`/tenders/${data.data.tender_id}`)
      } else {
        showToast(`Erreur : ${data.error}`)
      }
    } catch (e: any) { showToast(`Erreur : ${e.message}`) }
    setCreatingAo(null)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>

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
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-[#0a1f6e] border border-blue-500 rounded-lg px-4 py-2.5 text-xs text-blue-300 font-mono">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="AO actifs" value={actifs.length}
          delta={urgents.length > 0 ? `${urgents.length} urgent(s)` : 'Aucune urgence'}
          deltaVariant={urgents.length > 0 ? 'danger' : 'success'} />
        <KpiCard label="Taux reponse" value={`${tauxReponse}%`}
          delta={`${totalResp}/${totalSupp} fournisseurs`} />
        <KpiCard label="Devis recus" value={totalDevis}
          delta={emails.length > 0 ? `${emails.length} AO a traiter` : 'Tout traite'}
          deltaVariant={emails.length > 0 ? 'warn' : 'success'} />
        <KpiCard label="Taux reussite" value={`${tauxReussite}%`}
          delta={`${gagnes} AO gagnes`} deltaVariant="success" />
      </div>

      {urgents.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-5">
          <div className="font-mono text-[10px] text-red-400 uppercase tracking-widest mb-2">Urgences - deadline dans moins de 3 jours</div>
          {urgents.map(t => (
            <div key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
              className="flex items-center gap-3 py-2 cursor-pointer hover:opacity-80 transition-opacity">
              <span className="text-xs font-semibold text-white flex-1">{t.title}</span>
              <span className="font-mono text-xs text-red-400">{t.days_remaining}j restants</span>
              <Badge color={t.nb_responses > 0 ? 'amber' : 'red'}>{t.nb_responses}/{t.nb_suppliers}</Badge>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">AO en cours</span>
        <button onClick={() => router.push('/tenders')}
          className="text-xs text-slate-400 hover:text-white border border-white/10 hover:bg-white/5 px-3 py-1 rounded-md transition-colors">
          Voir tous
        </button>
      </div>

      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>{['Titre','Client','Deadline','Statut','Fournisseurs','Reponses'].map(h => (
            <th key={h} className="font-mono text-[10px] text-slate-500 uppercase tracking-widest text-left px-3 py-2 border-b border-white/10">{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {actifs.slice(0, 7).map(t => {
            const daysLeft = t.days_remaining
            const deadlineColor = daysLeft !== null && daysLeft <= 3 ? 'text-red-400' : 'text-slate-400'
            const respPct = t.nb_suppliers > 0 ? Math.round((t.nb_responses / t.nb_suppliers) * 100) : 0
            return (
              <tr key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
                className="hover:bg-white/5 cursor-pointer transition-colors group">
                <td className="px-3 py-2.5 font-semibold border-b border-white/5 group-hover:text-blue-300 transition-colors">{t.title}</td>
                <td className="px-3 py-2.5 text-slate-400 border-b border-white/5">{t.client}</td>
                <td className="px-3 py-2.5 border-b border-white/5">
                  <span className={`font-mono text-xs ${deadlineColor}`}>{daysLeft !== null ? `${daysLeft}j` : '-'}</span>
                </td>
                <td className="px-3 py-2.5 border-b border-white/5"><TenderStatusBadge status={t.status} /></td>
                <td className="px-3 py-2.5 border-b border-white/5"><Badge>{t.nb_suppliers}</Badge></td>
                <td className="px-3 py-2.5 border-b border-white/5">
                  <Badge color={respPct === 100 ? 'green' : respPct >= 50 ? 'amber' : t.nb_suppliers > 0 ? 'red' : 'gray'}>
                    {t.nb_responses}/{t.nb_suppliers}
                  </Badge>
                </td>
              </tr>
            )
          })}
          {actifs.length === 0 && (
            <tr><td colSpan={6} className="text-center text-slate-500 py-8 text-xs">
              Aucun AO en cours
            </td></tr>
          )}
        </tbody>
      </table>

      {emails.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
              Emails AO a traiter ({emails.length})
            </span>
            <button onClick={() => router.push('/mail')}
              className="text-xs text-slate-400 hover:text-white border border-white/10 hover:bg-white/5 px-3 py-1 rounded-md transition-colors">
              Voir tous
            </button>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            {emails.slice(0, 6).map(email => (
              <div key={email.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                <div className="w-7 h-7 rounded-md bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-[9px] text-amber-400 font-mono flex-shrink-0">
                  AO
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push('/mail')}>
                  <div className="text-xs font-semibold text-white truncate">{email.subject}</div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">{email.from_address}</div>
                </div>
                <span className={`font-mono text-[9px] px-2 py-0.5 rounded border ${
                  email.ao_score >= 60
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                }`}>
                  Score {email.ao_score}
                </span>
                <button
                  onClick={() => handleCreateAo(email)}
                  disabled={creatingAo === email.id}
                  className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-[10px] font-semibold px-3 py-1.5 rounded-md transition-colors flex-shrink-0"
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