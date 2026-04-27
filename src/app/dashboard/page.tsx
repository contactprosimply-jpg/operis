'use client'
// ============================================================
// OPERIS — app/dashboard/page.tsx — VERSION AMÉLIORÉE
// ============================================================

import { useRouter } from 'next/navigation'
import { useTenders, useMail } from '@/hooks'
import { KpiCard, Button, TenderStatusBadge, Badge, Spinner } from '@/components/ui'

export default function DashboardPage() {
  const router = useRouter()
  const { tenders, loading } = useTenders()
  const { emails } = useMail({ ao: true, unread: true })

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>

  const actifs    = tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status))
  const urgents   = tenders.filter(t => t.days_remaining !== null && t.days_remaining <= 3 && ['nouveau', 'en_cours', 'urgence'].includes(t.status))
  const totalResp = tenders.reduce((a, t) => a + (t.nb_responses ?? 0), 0)
  const totalSupp = tenders.reduce((a, t) => a + (t.nb_suppliers ?? 0), 0)
  const tauxReponse = totalSupp > 0 ? Math.round((totalResp / totalSupp) * 100) : 0
  const totalDevis = tenders.reduce((a, t) => a + (t.nb_quotes ?? 0), 0)
  const gagnes = tenders.filter(t => t.status === 'gagne').length
  const tauxReussite = tenders.length > 0 ? Math.round((gagnes / tenders.length) * 100) : 0

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="AO actifs" value={actifs.length}
          delta={urgents.length > 0 ? `⚠ ${urgents.length} urgent(s)` : undefined}
          deltaVariant={urgents.length > 0 ? 'danger' : 'success'} />
        <KpiCard label="Taux réponse" value={`${tauxReponse}%`}
          delta={totalSupp > 0 ? `${totalResp}/${totalSupp} fournisseurs` : undefined} />
        <KpiCard label="Devis reçus" value={totalDevis}
          delta={emails.length > 0 ? `${emails.length} AO non traités` : undefined}
          deltaVariant={emails.length > 0 ? 'warn' : 'success'} />
        <KpiCard label="Taux réussite" value={`${tauxReussite}%`}
          delta={`${gagnes} AO gagnés`} deltaVariant="success" />
      </div>

      {/* AO urgents */}
      {urgents.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-5">
          <div className="font-mono text-[10px] text-red-400 uppercase tracking-widest mb-2">⚠ AO urgents — deadline dans moins de 3 jours</div>
          {urgents.map(t => (
            <div key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
              className="flex items-center gap-3 py-2 cursor-pointer hover:opacity-80">
              <span className="text-xs font-semibold text-white flex-1">{t.title}</span>
              <span className="text-xs font-mono text-red-400">{t.days_remaining}j restants</span>
              <Badge color={t.nb_responses > 0 ? 'amber' : 'red'}>{t.nb_responses}/{t.nb_suppliers} réponses</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Table AO */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">AO en cours</span>
        <Button variant="ghost" onClick={() => router.push('/tenders')}>Voir tous →</Button>
      </div>

      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            {['Titre', 'Client', 'Deadline', 'Statut', 'Fournisseurs', 'Réponses'].map(h => (
              <th key={h} className="font-mono text-[10px] text-slate-500 uppercase tracking-widest text-left px-3 py-2 border-b border-white/10">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actifs.slice(0, 7).map(t => {
            const daysLeft = t.days_remaining
            const deadlineColor = daysLeft !== null && daysLeft <= 3 ? 'text-red-400' : 'text-slate-400'
            const respPct = t.nb_suppliers > 0 ? Math.round((t.nb_responses / t.nb_suppliers) * 100) : 0

            return (
              <tr key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
                className="hover:bg-white/5 cursor-pointer transition-colors">
                <td className="px-3 py-2.5 font-semibold border-b border-white/5">{t.title}</td>
                <td className="px-3 py-2.5 text-slate-400 border-b border-white/5">{t.client}</td>
                <td className="px-3 py-2.5 border-b border-white/5">
                  <span className={`font-mono text-xs ${deadlineColor}`}>{daysLeft !== null ? `${daysLeft}j` : '—'}</span>
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
              Aucun AO en cours —{' '}
              <button onClick={() => router.push('/tenders')} className="text-blue-400 hover:underline">créer un AO</button>
            </td></tr>
          )}
        </tbody>
      </table>

      {/* Emails AO non traités */}
      {emails.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
              Emails AO non traités ({emails.length})
            </span>
            <Button variant="ghost" onClick={() => router.push('/mail?filter=ao')}>Voir tous →</Button>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            {emails.slice(0, 4).map(email => (
              <div key={email.id} onClick={() => router.push('/mail')}
                className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/5 transition-colors">
                <div className="w-7 h-7 rounded-md bg-[#0a1f6e] border border-blue-500/35 flex items-center justify-center text-[9px] text-blue-400 font-mono flex-shrink-0">@</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{email.subject}</div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">{email.from_address}</div>
                </div>
                <Badge color={email.ao_score >= 60 ? 'amber' : 'blue'}>Score {email.ao_score}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
