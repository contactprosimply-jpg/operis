'use client'
// ============================================================
// OPERIS — app/dashboard/page.tsx
// Dashboard connecté — données réelles depuis Supabase
// ============================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenders, useMail } from '@/hooks'
import { KpiCard, Button, TenderStatusBadge, Badge, Spinner, useToast } from '@/components/ui'
import { TenderStats } from '@/types/database'

export default function DashboardPage() {
  const router = useRouter()
  const { tenders, loading } = useTenders()
  const { emails, syncing, sync } = useMail({ ao: true, unread: true })
  const { show, ToastComponent } = useToast()

  const handleSync = async () => {
    const res = await sync()
    if (res.success) {
      show(`Synchro terminée — ${res.data.aoDetected} AO détectés`)
    }
  }

  // Calcul KPIs
  const actifs    = tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status))
  const totalResp = tenders.reduce((a, t) => a + (t.nb_responses ?? 0), 0)
  const totalSupp = tenders.reduce((a, t) => a + (t.nb_suppliers ?? 0), 0)
  const tauxReponse = totalSupp > 0 ? Math.round((totalResp / totalSupp) * 100) : 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Spinner size={32} />
    </div>
  )

  return (
    <div>
      {ToastComponent}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="AO actifs"       value={actifs.length} />
        <KpiCard label="Taux réponse"    value={`${tauxReponse}%`} />
        <KpiCard label="Emails AO non traités" value={emails.length} deltaVariant="warn" />
        <KpiCard
          label="Devis reçus"
          value={tenders.reduce((a, t) => a + (t.nb_quotes ?? 0), 0)}
        />
      </div>

      {/* Table AO */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
          AO en cours
        </span>
        <Button variant="ghost" onClick={() => router.push('/tenders')}>
          Voir tous →
        </Button>
      </div>

      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            {['Titre', 'Client', 'Deadline', 'Statut', 'Fournisseurs', 'Réponses'].map(h => (
              <th key={h} className="font-mono text-[10px] text-slate-500 uppercase tracking-widest text-left px-3 py-2 border-b border-white/10">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actifs.slice(0, 5).map((t) => (
            <TenderRow key={t.tender_id} tender={t} onClick={() => router.push(`/tenders/${t.tender_id}`)} />
          ))}
          {actifs.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-slate-500 py-8 text-xs">
                Aucun AO en cours — créez votre premier AO
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Emails détectés */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
          Emails AO non traités
        </span>
        <Button variant="ghost" loading={syncing} onClick={handleSync}>
          ⟳ Synchroniser
        </Button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        {emails.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-xs">
            Aucun email AO non traité
          </div>
        ) : (
          emails.slice(0, 5).map((email) => (
            <div key={email.id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
              <div className="w-7 h-7 rounded-md bg-[#0a1f6e] border border-blue-500/35 flex items-center justify-center text-[9px] text-blue-400 font-mono flex-shrink-0">
                @
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">{email.subject}</div>
                <div className="text-[10px] font-mono text-slate-500 truncate">{email.from_address}</div>
              </div>
              <Badge color={email.ao_score >= 60 ? 'amber' : 'blue'}>
                Score {email.ao_score}
              </Badge>
              <Button
                variant="primary"
                onClick={() => router.push('/mail')}
              >
                Traiter
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Ligne AO dans la table ────────────────────────────────────
function TenderRow({ tender, onClick }: { tender: TenderStats; onClick: () => void }) {
  const daysLeft = tender.days_remaining
  const deadlineColor = daysLeft !== null && daysLeft <= 3 ? 'text-red-400' : 'text-slate-400'

  const respPct = tender.nb_suppliers > 0
    ? Math.round((tender.nb_responses / tender.nb_suppliers) * 100)
    : 0

  return (
    <tr onClick={onClick} className="hover:bg-white/5 cursor-pointer transition-colors">
      <td className="px-3 py-2.5 font-semibold border-b border-white/5">{tender.title}</td>
      <td className="px-3 py-2.5 text-slate-400 border-b border-white/5">{tender.client}</td>
      <td className="px-3 py-2.5 border-b border-white/5">
        <span className={`font-mono text-xs ${deadlineColor}`}>
          {daysLeft !== null ? `${daysLeft}j` : '—'}
        </span>
      </td>
      <td className="px-3 py-2.5 border-b border-white/5">
        <TenderStatusBadge status={tender.status} />
      </td>
      <td className="px-3 py-2.5 border-b border-white/5">
        <Badge>{tender.nb_suppliers}</Badge>
      </td>
      <td className="px-3 py-2.5 border-b border-white/5">
        <Badge color={respPct === 100 ? 'green' : respPct >= 50 ? 'amber' : 'red'}>
          {tender.nb_responses}/{tender.nb_suppliers}
        </Badge>
      </td>
    </tr>
  )
}
