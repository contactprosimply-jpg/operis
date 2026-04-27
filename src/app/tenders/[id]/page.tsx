'use client'
// ============================================================
// OPERIS — app/tenders/[id]/page.tsx — V2
// Détail AO + enregistrement devis + compositeur mail
// ============================================================

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTenderDetail, useSuppliers } from '@/hooks'
import {
  Button, Modal, TenderStatusBadge, ConsultationStatusBadge,
  KpiCard, ProgressBar, Spinner, useToast, Field,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ConsultationWithSupplier } from '@/types/database'

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = await getToken()
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })
}

export default function TenderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { tender, loading, addSupplier, relaunchAll, markStatus, refetch } = useTenderDetail(id)
  const { suppliers } = useSuppliers()
  const { show, ToastComponent } = useToast()

  // États modales
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  // Compositeur consultation
  const [showComposer, setShowComposer] = useState(false)
  const [selectedConsultSuppliers, setSelectedConsultSuppliers] = useState<string[]>([])
  const [composerSubject, setComposerSubject] = useState('')
  const [composerBody, setComposerBody] = useState('')
  const [sendingConsult, setSendingConsult] = useState(false)

  // Compositeur relance
  const [showRelaunchComposer, setShowRelaunchComposer] = useState(false)
  const [relaunchTarget, setRelaunchTarget] = useState<ConsultationWithSupplier | null>(null)
  const [relaunchSubject, setRelaunchSubject] = useState('')
  const [relaunchBody, setRelaunchBody] = useState('')
  const [sendingRelaunch, setSendingRelaunch] = useState(false)

  // Enregistrement devis
  const [showAddQuote, setShowAddQuote] = useState(false)
  const [quoteSupplier, setQuoteSupplier] = useState('')
  const [quotePriceHT, setQuotePriceHT] = useState('')
  const [quoteNotes, setQuoteNotes] = useState('')
  const [savingQuote, setSavingQuote] = useState(false)

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>
  if (!tender) return <div className="text-center text-slate-500 py-20">AO introuvable</div>

  const stats = tender.stats
  const respPct = stats?.nb_suppliers > 0 ? Math.round((stats.nb_responses / stats.nb_suppliers) * 100) : 0
  const delayPct = tender.deadline
    ? Math.min(100, Math.round(((new Date().getTime() - new Date(tender.created_at).getTime()) /
        (new Date(tender.deadline).getTime() - new Date(tender.created_at).getTime())) * 100))
    : 0

  const addedIds = tender.consultations.map(c => c.supplier_id)
  const availableSuppliers = suppliers.filter(s => !addedIds.includes(s.id))

  const action = async (key: string, fn: () => Promise<any>, successMsg: string) => {
    setLoadingAction(key)
    const res = await fn()
    setLoadingAction(null)
    if (res?.success) show(successMsg)
    else show(`Erreur : ${res?.error}`)
  }

  // ── Compositeur consultation ──────────────────────────────
  const openConsultComposer = () => {
    const pending = tender.consultations.filter(c => c.status === 'en_attente')
    const targets = pending.length > 0 ? pending : tender.consultations
    setSelectedConsultSuppliers(targets.map(c => c.supplier_id))
    setComposerSubject(`Consultation — ${tender.title}`)
    setComposerBody(`Bonjour,\n\nNous vous contactons dans le cadre d'un appel d'offres pour le projet suivant :\n\nProjet : ${tender.title}\nClient : ${tender.client}${tender.deadline ? `\nDate limite : ${new Date(tender.deadline).toLocaleDateString('fr-FR')}` : ''}\n\nMerci de nous faire parvenir votre offre dans les meilleurs délais.\n\nCordialement,\nL'équipe ${tender.client}`)
    setShowComposer(true)
  }

  const sendConsultation = async () => {
    if (selectedConsultSuppliers.length === 0) { show('Sélectionne au moins un fournisseur'); return }
    setSendingConsult(true)
    let sent = 0, errors = 0
    for (const supplierId of selectedConsultSuppliers) {
      const c = tender.consultations.find(c => c.supplier_id === supplierId)
      if (!c) continue
      try {
        const mailRes = await authFetch('/api/mail/send', {
          method: 'POST',
          body: JSON.stringify({ to: c.supplier.email, subject: composerSubject, body: composerBody }),
        })
        const mailData = await mailRes.json()
        if (mailData.success) {
          await authFetch(`/api/tenders/${id}/consult`, {
            method: 'POST',
            body: JSON.stringify({ supplier_ids: [supplierId] }),
          })
          sent++
        } else errors++
      } catch { errors++ }
    }
    setSendingConsult(false)
    setShowComposer(false)
    await refetch()
    show(`${sent} consultation(s) envoyée(s)${errors > 0 ? ` — ${errors} erreur(s)` : ' ✓'}`)
  }

  // ── Compositeur relance ───────────────────────────────────
  const openRelaunchComposer = (consultation: ConsultationWithSupplier) => {
    setRelaunchTarget(consultation)
    const n = (consultation.relaunch_count ?? 0) + 1
    setRelaunchSubject(`Relance${n > 1 ? ` ${n}` : ''} — ${tender.title}`)
    setRelaunchBody(`Bonjour,\n\nSauf erreur de notre part, nous n'avons pas encore reçu votre devis concernant :\n\nProjet : ${tender.title}\nClient : ${tender.client}${tender.deadline ? `\nDate limite : ${new Date(tender.deadline).toLocaleDateString('fr-FR')}` : ''}\n\nPourriez-vous nous faire parvenir votre offre dans les meilleurs délais ?\n\nCordialement,\nL'équipe ${tender.client}`)
    setShowRelaunchComposer(true)
  }

  const sendRelaunch = async () => {
    if (!relaunchTarget) return
    setSendingRelaunch(true)
    try {
      const mailRes = await authFetch('/api/mail/send', {
        method: 'POST',
        body: JSON.stringify({ to: relaunchTarget.supplier.email, subject: relaunchSubject, body: relaunchBody }),
      })
      const mailData = await mailRes.json()
      if (mailData.success) {
        await authFetch(`/api/tenders/${id}/relaunch`, {
          method: 'POST',
          body: JSON.stringify({ supplier_id: relaunchTarget.supplier_id }),
        })
        setShowRelaunchComposer(false)
        await refetch()
        show(`Relance envoyée à ${relaunchTarget.supplier.name} ✓`)
      } else show(`Erreur : ${mailData.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setSendingRelaunch(false)
  }

  // ── Enregistrer un devis ──────────────────────────────────
  const saveQuote = async () => {
    if (!quoteSupplier) { show('Sélectionne un fournisseur'); return }
    setSavingQuote(true)
    try {
      const res = await authFetch('/api/quotes', {
        method: 'POST',
        body: JSON.stringify({
          tender_id: id,
          supplier_id: quoteSupplier,
          price_ht: quotePriceHT ? parseFloat(quotePriceHT.replace(',', '.')) : null,
          notes: quoteNotes || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setShowAddQuote(false)
        setQuoteSupplier('')
        setQuotePriceHT('')
        setQuoteNotes('')
        await refetch()
        show('Devis enregistré ✓')
      } else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setSavingQuote(false)
  }

  return (
    <div>
      {ToastComponent}

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <button onClick={() => router.back()} className="text-[10px] text-slate-500 hover:text-slate-300 mb-2 font-mono">← Retour</button>
          <div className="text-lg font-bold">{tender.title}</div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
            <span>{tender.client}</span>
            {tender.deadline && stats?.days_remaining !== null && (
              <span className={stats.days_remaining <= 3 ? 'text-red-400' : ''}>{stats.days_remaining}j restants</span>
            )}
            <TenderStatusBadge status={tender.status} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="success" onClick={openConsultComposer}>Envoyer consultation</Button>
          <Button variant="ghost" onClick={() => setShowAddQuote(true)}>+ Devis reçu</Button>
          <Button variant="ghost" loading={loadingAction === 'relaunch-all'} onClick={() => action('relaunch-all', relaunchAll, 'Relances envoyées ✓')}>Relancer tout</Button>
          <Button variant="success" loading={loadingAction === 'won'} onClick={() => action('won', () => markStatus('gagne'), 'AO Gagné ✓')}>Gagné</Button>
          <Button variant="danger" loading={loadingAction === 'lost'} onClick={() => action('lost', () => markStatus('perdu'), 'AO Perdu')}>Perdu</Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-4">
        <div>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <KpiCard label="Délai restant" value={stats?.days_remaining !== null ? `${stats.days_remaining}j` : '—'} />
            <KpiCard label="Fournisseurs" value={stats?.nb_suppliers ?? 0} />
            <KpiCard label="Réponses" value={stats?.nb_responses ?? 0} />
            <KpiCard label="Devis" value={stats?.nb_quotes ?? 0} />
          </div>

          {/* Fournisseurs */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">Fournisseurs consultés</span>
              <Button variant="ghost" onClick={() => setShowAddSupplier(true)}>+ Ajouter</Button>
            </div>
            {tender.consultations.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-4">Aucun fournisseur ajouté</div>
            ) : tender.consultations.map(c => (
              <div key={c.id} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                <div className="w-7 h-7 rounded-md bg-[#0a1f6e] border border-blue-500/35 flex items-center justify-center text-[9px] text-blue-400 font-mono flex-shrink-0">
                  {c.supplier.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{c.supplier.name}</div>
                  <div className="text-[10px] font-mono text-slate-500 truncate">{c.supplier.email}</div>
                </div>
                <ConsultationStatusBadge status={c.status} />
                <Button variant="ghost" onClick={() => openRelaunchComposer(c)}>Relancer</Button>
                <Button variant="success" onClick={() => { setQuoteSupplier(c.supplier_id); setShowAddQuote(true) }}>
                  + Devis
                </Button>
              </div>
            ))}
          </div>

          {/* Devis reçus */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">Devis reçus</span>
              <Button variant="ghost" onClick={() => setShowAddQuote(true)}>+ Ajouter</Button>
            </div>
            {tender.quotes.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-4">Aucun devis reçu</div>
            ) : (
              <>
                <table className="w-full text-xs mb-3">
                  <thead><tr>{['Fournisseur','Montant HT','Notes','Reçu le'].map(h => (
                    <th key={h} className="font-mono text-[10px] text-slate-500 text-left pb-2">{h}</th>
                  ))}</tr></thead>
                  <tbody>{tender.quotes.map(q => (
                    <tr key={q.id} className="border-t border-white/5">
                      <td className="py-2 font-semibold">{q.supplier.name}</td>
                      <td className="py-2 font-mono text-emerald-400">
                        {q.price_ht ? `${q.price_ht.toLocaleString('fr-FR')} € HT` : '—'}
                      </td>
                      <td className="py-2 text-slate-400">{q.notes ?? '—'}</td>
                      <td className="py-2 font-mono text-slate-400">{new Date(q.received_at).toLocaleDateString('fr-FR')}</td>
                    </tr>
                  ))}</tbody>
                </table>

                {/* Comparateur */}
                {tender.quotes.length > 1 && stats?.min_quote && stats?.max_quote && (
                  <div className="bg-white/5 rounded-md p-3 mt-2">
                    <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-2">Comparatif</div>
                    <div className="flex gap-6 text-xs">
                      <div>
                        <div className="text-slate-500 mb-1">Moins cher</div>
                        <div className="font-mono text-emerald-400 font-semibold">{stats.min_quote.toLocaleString('fr-FR')} € HT</div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Plus cher</div>
                        <div className="font-mono text-red-400 font-semibold">{stats.max_quote.toLocaleString('fr-FR')} € HT</div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Écart</div>
                        <div className="font-mono text-amber-400 font-semibold">
                          {(stats.max_quote - stats.min_quote).toLocaleString('fr-FR')} € HT
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Droite */}
        <div className="flex flex-col gap-3">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-3">Avancement</div>
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Taux de réponse</span><span className="font-mono">{respPct}%</span>
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

          {/* Actions rapides */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-3">Actions rapides</div>
            <div className="flex flex-col gap-2">
              <Button variant="primary" className="w-full justify-center" onClick={openConsultComposer}>Envoyer consultation</Button>
              <Button variant="ghost" className="w-full justify-center" onClick={() => setShowAddQuote(true)}>+ Enregistrer un devis</Button>
              <Button variant="success" className="w-full justify-center" loading={loadingAction === 'won'} onClick={() => action('won', () => markStatus('gagne'), 'AO Gagné ✓')}>Marquer Gagné</Button>
              <Button variant="danger" className="w-full justify-center" loading={loadingAction === 'lost'} onClick={() => action('lost', () => markStatus('perdu'), 'AO Perdu')}>Marquer Perdu</Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL : Ajouter fournisseur ── */}
      <Modal open={showAddSupplier} onClose={() => setShowAddSupplier(false)} title="Ajouter un fournisseur">
        <div className="mb-4">
          <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">Fournisseur</div>
          <select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)}
            className="w-full bg-white/5 border border-blue-500/35 rounded-md px-3 py-2 text-sm text-white outline-none">
            <option value="">Sélectionner...</option>
            {availableSuppliers.map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setShowAddSupplier(false)}>Annuler</Button>
          <Button variant="primary" loading={loadingAction === 'add-supplier'}
            onClick={async () => {
              if (!selectedSupplierId) return
              await action('add-supplier', () => addSupplier(selectedSupplierId), 'Fournisseur ajouté ✓')
              setShowAddSupplier(false)
              setSelectedSupplierId('')
            }}>Ajouter</Button>
        </div>
      </Modal>

      {/* ── MODAL : Enregistrer devis ── */}
      <Modal open={showAddQuote} onClose={() => setShowAddQuote(false)} title="Enregistrer un devis reçu">
        <div className="mb-4">
          <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">Fournisseur *</div>
          <select value={quoteSupplier} onChange={e => setQuoteSupplier(e.target.value)}
            className="w-full bg-white/5 border border-blue-500/35 rounded-md px-3 py-2 text-sm text-white outline-none">
            <option value="">Sélectionner...</option>
            {tender.consultations.map(c => (
              <option key={c.supplier_id} value={c.supplier_id}>{c.supplier.name}</option>
            ))}
          </select>
        </div>
        <Field label="Montant HT (€)" value={quotePriceHT} onChange={setQuotePriceHT} placeholder="Ex: 84500" />
        <Field label="Notes" value={quoteNotes} onChange={setQuoteNotes} placeholder="Observations, conditions..." />
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="ghost" onClick={() => setShowAddQuote(false)}>Annuler</Button>
          <Button variant="primary" loading={savingQuote} onClick={saveQuote}>Enregistrer</Button>
        </div>
      </Modal>

      {/* ── MODAL : Compositeur consultation ── */}
      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#021246]/88"
          onClick={e => { if (e.target === e.currentTarget) setShowComposer(false) }}>
          <div className="bg-[#0d1f5c] border border-blue-500/35 rounded-xl w-[600px] max-w-[95vw] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <div className="text-sm font-bold">Envoyer la consultation</div>
              <button onClick={() => setShowComposer(false)} className="text-slate-500 hover:text-white text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-4">
                <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-2">Destinataires</div>
                {tender.consultations.map(c => (
                  <label key={c.supplier_id} className="flex items-center gap-2 py-1.5 cursor-pointer">
                    <input type="checkbox" checked={selectedConsultSuppliers.includes(c.supplier_id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedConsultSuppliers(p => [...p, c.supplier_id])
                        else setSelectedConsultSuppliers(p => p.filter(x => x !== c.supplier_id))
                      }} className="accent-blue-500" />
                    <span className="text-xs text-white">{c.supplier.name}</span>
                    <span className="text-[10px] font-mono text-slate-500">{c.supplier.email}</span>
                    <ConsultationStatusBadge status={c.status} />
                  </label>
                ))}
              </div>
              <div className="mb-3">
                <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">Objet</div>
                <input type="text" value={composerSubject} onChange={e => setComposerSubject(e.target.value)}
                  className="w-full bg-white/5 border border-blue-500/35 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
              </div>
              <div>
                <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">Message</div>
                <textarea value={composerBody} onChange={e => setComposerBody(e.target.value)} rows={10}
                  className="w-full bg-white/5 border border-blue-500/35 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 resize-none font-mono" />
              </div>
            </div>
            <div className="flex gap-2 justify-end px-5 py-4 border-t border-white/10 flex-shrink-0">
              <Button variant="ghost" onClick={() => setShowComposer(false)}>Annuler</Button>
              <Button variant="primary" loading={sendingConsult} onClick={sendConsultation}>
                → Envoyer à {selectedConsultSuppliers.length} fournisseur(s)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL : Compositeur relance ── */}
      {showRelaunchComposer && relaunchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#021246]/88"
          onClick={e => { if (e.target === e.currentTarget) setShowRelaunchComposer(false) }}>
          <div className="bg-[#0d1f5c] border border-blue-500/35 rounded-xl w-[600px] max-w-[95vw] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
              <div className="text-sm font-bold">Relancer — {relaunchTarget.supplier.name}</div>
              <button onClick={() => setShowRelaunchComposer(false)} className="text-slate-500 hover:text-white text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="bg-white/5 border border-white/10 rounded-md px-3 py-2 mb-3 text-xs text-slate-400 font-mono">
                À : {relaunchTarget.supplier.email}
              </div>
              <div className="mb-3">
                <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">Objet</div>
                <input type="text" value={relaunchSubject} onChange={e => setRelaunchSubject(e.target.value)}
                  className="w-full bg-white/5 border border-blue-500/35 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
              </div>
              <div>
                <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">Message</div>
                <textarea value={relaunchBody} onChange={e => setRelaunchBody(e.target.value)} rows={10}
                  className="w-full bg-white/5 border border-blue-500/35 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 resize-none font-mono" />
              </div>
            </div>
            <div className="flex gap-2 justify-end px-5 py-4 border-t border-white/10 flex-shrink-0">
              <Button variant="ghost" onClick={() => setShowRelaunchComposer(false)}>Annuler</Button>
              <Button variant="primary" loading={sendingRelaunch} onClick={sendRelaunch}>→ Envoyer la relance</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
