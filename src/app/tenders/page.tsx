'use client'
// ============================================================
// OPERIS — app/tenders/page.tsx
// Liste complète des AO connectée à Supabase
// ============================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenders } from '@/hooks'
import { Button, Modal, Field, TenderStatusBadge, Badge, Spinner, useToast } from '@/components/ui'
import { TenderStatus } from '@/types/database'

export default function TendersPage() {
  const router = useRouter()
  const { tenders, loading, create } = useTenders()
  const { show, ToastComponent } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState<string>('tous')
  const [creating, setCreating] = useState(false)

  // Form state
  const [form, setForm] = useState({ title: '', client: '', deadline: '', description: '' })

  const filtered = filter === 'tous'
    ? tenders
    : tenders.filter(t => t.status === filter)

  const handleCreate = async () => {
    if (!form.title || !form.client) return
    setCreating(true)
    const res = await create({
      title: form.title,
      client: form.client,
      deadline: form.deadline || undefined,
      description: form.description || undefined,
    })
    setCreating(false)
    if (res.success) {
      setShowModal(false)
      setForm({ title: '', client: '', deadline: '', description: '' })
      show('AO créé avec succès ✓')
    } else {
      show(`Erreur : ${res.error}`)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>
  )

  return (
    <div>
      {ToastComponent}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
          Appels d'offres
        </span>
        <div className="flex gap-2 items-center">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-400 outline-none"
          >
            <option value="tous">Tous les statuts</option>
            <option value="nouveau">Nouveau</option>
            <option value="en_cours">En cours</option>
            <option value="urgence">Urgence</option>
            <option value="gagne">Gagné</option>
            <option value="perdu">Perdu</option>
          </select>
          <Button variant="primary" onClick={() => setShowModal(true)}>+ Nouvel AO</Button>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {['Titre', 'Client', 'Deadline', 'Statut', 'Fournisseurs', 'Réponses', 'Devis'].map(h => (
              <th key={h} className="font-mono text-[10px] text-slate-500 uppercase tracking-widest text-left px-3 py-2 border-b border-white/10">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(t => {
            const daysLeft = t.days_remaining
            const deadlineColor = daysLeft !== null && daysLeft <= 3 ? 'text-red-400' : 'text-slate-400'
            const respPct = t.nb_suppliers > 0 ? Math.round((t.nb_responses / t.nb_suppliers) * 100) : 0

            return (
              <tr
                key={t.tender_id}
                onClick={() => router.push(`/tenders/${t.tender_id}`)}
                className="hover:bg-white/5 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2.5 font-semibold border-b border-white/5">{t.title}</td>
                <td className="px-3 py-2.5 text-slate-400 border-b border-white/5">{t.client}</td>
                <td className="px-3 py-2.5 border-b border-white/5">
                  <span className={`font-mono text-xs ${deadlineColor}`}>
                    {daysLeft !== null ? `${daysLeft}j` : '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 border-b border-white/5">
                  <TenderStatusBadge status={t.status} />
                </td>
                <td className="px-3 py-2.5 border-b border-white/5">
                  <Badge>{t.nb_suppliers}</Badge>
                </td>
                <td className="px-3 py-2.5 border-b border-white/5">
                  <Badge color={respPct === 100 ? 'green' : respPct >= 50 ? 'amber' : 'red'}>
                    {t.nb_responses}/{t.nb_suppliers}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 border-b border-white/5">
                  <Badge color={t.nb_quotes > 0 ? 'green' : 'gray'}>{t.nb_quotes}</Badge>
                </td>
              </tr>
            )
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-slate-500 py-10 text-xs">
                Aucun AO trouvé
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Modal création */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouvel appel d'offres">
        <Field label="Titre *"       value={form.title}       onChange={v => setForm(f => ({ ...f, title: v }))}       placeholder="Ex: Réhabilitation façades R+5" />
        <Field label="Client *"      value={form.client}      onChange={v => setForm(f => ({ ...f, client: v }))}      placeholder="Ex: Nexity Grand Paris" />
        <Field label="Deadline"      value={form.deadline}    onChange={v => setForm(f => ({ ...f, deadline: v }))}    type="date" />
        <Field label="Description"   value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Description du marché..." />
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="ghost"   onClick={() => setShowModal(false)}>Annuler</Button>
          <Button variant="primary" onClick={handleCreate} loading={creating}>Créer l'AO</Button>
        </div>
      </Modal>
    </div>
  )
}
