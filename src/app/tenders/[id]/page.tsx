'use client'
// ============================================================
// OPERIS — app/tenders/[id]/page.tsx
// Détail AO complet — toutes les actions connectées
// ============================================================

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTenderDetail, useSuppliers } from '@/hooks'
import {
  Button, Modal, Badge, TenderStatusBadge, ConsultationStatusBadge,
  KpiCard, ProgressBar, Spinner, useToast, Field,
} from '@/components/ui'

export default function TenderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const {
    tender, loading,
    addSupplier, sendConsultation, relaunchSupplier, relaunchAll, markStatus,
  } = useTenderDetail(id)
  const { suppliers } = useSuppliers()
  const { show, ToastComponent } = useToast()

  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>
  )
  if (!tender) return (
    <div className="text-center text-slate-500 py-20">AO introuvable</div>
  )

  const stats = tender.stats
  const respPct  = stats?.nb_suppliers > 0 ? Math.round((stats.nb_responses / stats.nb_suppliers) * 100) : 0
  const delayPct = tender.deadline
    ? Math.min(100, Math.round(((new Date().getTime() - new Date(tender.created_at).getTime()) /
        (new Date(tender.deadline).getTime() - new Date(tender.created_at).getTime())) * 100))
    : 0

  // Fournisseurs pas encore ajoutés à cet AO
  const addedIds = tender.consultations.map(c => c.supplier_id)
  const availableSuppliers = suppliers.filter(s => !addedIds.includes(s.id))

  const action = async (key: string, fn: () => Promise<any>, successMsg: string) => {
    setLoadingAction(key)
    const res = await fn()
    setLoadingAction(null)
    if (res?.success) show(successMsg)
    else show(`Erreur : ${res?.error}`)
  }

  return (
    <div>
      {ToastComponent}

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <button onClick={() => router.back()} className="text-[10px] text-slate-500 hover:text-slate-300 mb-2 font-mono">
            ← Retour
          </button>
          <div className="text-lg font-bold">{tender.title}</div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
            <span>{tender.client}</span>
            {tender.deadline && (
              <span className={stats?.days_remaining !== null && stats.days_remaining <= 3 ? 'text-red-400' : ''}>
                {stats?.days_remaining !== null ? `${stats.days_remaining} jours restants` : ''}
              </span>
            )}
            <TenderStatusBadge status={tender.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="success"
            loading={loadingAction === 'consult'}
            onClick={() => {
              const ids = tender.consultations
                .filter(c => c.status === 'en_attente')
                .map(c => c.supplier_id)
              action('consult', () => sendConsultation(ids), `Consultation envoyée à ${ids.length} fournisseurs ✓`)
            }}
          >
            Envoyer consultation
          </Button>
          <Button
            variant="ghost"
            loading={loadingAction === 'relaunch-all'}
            onClick={() => action('relaunch-all', relaunchAll, 'Relances envoyées ✓')}
          >
            Relancer tout
          </Button>
          <Button
            variant="success"
            loading={loadingAction === 'won'}
            onClick={() => action('won', () => markStatus('gagne'), 'AO marqué Gagné ✓')}
          >
            Gagné
          </Button>
          <Button
            variant="danger"
            loading={loadingAction === 'lost'}
            onClick={() => action('lost', () => markStatus('perdu'), 'AO marqué Perdu')}
          >
            Perdu
          </Button>
        </div>
      </div>

      {/* Layout 2 colonnes */}
      <div className="grid grid-cols-[1fr_300px] gap-4">

        {/* GAUCHE */}
        <div>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <KpiCard label="Délai restant"  value={stats?.days_remaining !== null ? `${stats.days_remaining}j` : '—'} />
            <KpiCard label="Fournisseurs"   value={stats?.nb_suppliers ?? 0} />
            <KpiCard label="Réponses"       value={stats?.nb_responses ?? 0} />
            <KpiCard label="Relances"       value={stats?.nb_relaunched ?? 0} />
          </div>

          {/* Fournisseurs */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">Fournisseurs consultés</span>
              <Button variant="ghost" onClick={() => setShowAddSupplier(true)}>+ Ajouter</Button>
            </div>
            {tender.consultations.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-4">Aucun fournisseur ajouté</div>
            ) : (
              tender.consultations.map(c => (
                <div key={c.id} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                  <div className="w-7 h-7 rounded-md bg-[#0a1f6e] border border-blue-500/35 flex items-center justify-center text-[9px] text-blue-400 font-mono flex-shrink-0">
                    {c.supplier.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{c.supplier.name}</div>
                    <div className="text-[10px] font-mono text-slate-500 truncate">{c.supplier.email}</div>
                  </div>
                  <ConsultationStatusBadge status={c.status} />
                  <Button
                    variant="ghost"
                    loading={loadingAction === `relaunch-${c.supplier_id}`}
                    onClick={() => action(
                      `relaunch-${c.supplier_id}`,
                      () => relaunchSupplier(c.supplier_id),
                      `Relance envoyée à ${c.supplier.name} ✓`
                    )}
                  >
                    Relancer
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Devis */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-3">Devis reçus</div>
            {tender.quotes.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-4">Aucun devis reçu</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {['Fournisseur', 'Montant HT', 'Reçu le'].map(h => (
                      <th key={h} className="font-mono text-[10px] text-slate-500 text-left pb-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tender.quotes.map(q => (
                    <tr key={q.id} className="border-t border-white/5">
                      <td className="py-2">{q.supplier.name}</td>
                      <td className="py-2 font-mono">
                        {q.price_ht ? `${q.price_ht.toLocaleString('fr-FR')} €` : '—'}
                      </td>
                      <td className="py-2 font-mono text-slate-400">
                        {new Date(q.received_at).toLocaleDateString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* DROITE */}
        <div className="flex flex-col gap-3">
          {/* Avancement */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-3">Avancement</div>
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Taux de réponse</span>
                <span className="font-mono">{respPct}%</span>
              </div>
              <ProgressBar value={respPct} variant={respPct >= 80 ? 'success' : respPct >= 50 ? 'warn' : 'danger'} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Délai consommé</span>
                <span className={`font-mono ${delayPct >= 85 ? 'text-red-400' : ''}`}>{delayPct}%</span>
              </div>
              <ProgressBar value={delayPct} variant={delayPct >= 85 ? 'danger' : delayPct >= 60 ? 'warn' : 'accent'} />
            </div>
          </div>

          {/* Prix min/max */}
          {(stats?.min_quote || stats?.max_quote) && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-3">Fourchette devis</div>
              <div className="flex justify-between text-xs">
                <div>
                  <div className="text-slate-500 mb-1">Min</div>
                  <div className="font-mono text-emerald-400">{stats.min_quote?.toLocaleString('fr-FR')} €</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-500 mb-1">Max</div>
                  <div className="font-mono text-red-400">{stats.max_quote?.toLocaleString('fr-FR')} €</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal ajouter fournisseur */}
      <Modal open={showAddSupplier} onClose={() => setShowAddSupplier(false)} title="Ajouter un fournisseur">
        <div className="mb-4">
          <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">Fournisseur</div>
          <select
            value={selectedSupplierId}
            onChange={e => setSelectedSupplierId(e.target.value)}
            className="w-full bg-white/5 border border-blue-500/35 rounded-md px-3 py-2 text-sm text-white outline-none"
          >
            <option value="">Sélectionner...</option>
            {availableSuppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name} — {s.email}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setShowAddSupplier(false)}>Annuler</Button>
          <Button
            variant="primary"
            loading={loadingAction === 'add-supplier'}
            onClick={async () => {
              if (!selectedSupplierId) return
              await action(
                'add-supplier',
                () => addSupplier(selectedSupplierId),
                'Fournisseur ajouté ✓'
              )
              setShowAddSupplier(false)
              setSelectedSupplierId('')
            }}
          >
            Ajouter
          </Button>
        </div>
      </Modal>
    </div>
  )
}
