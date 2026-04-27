'use client'
// ============================================================
// OPERIS — app/tenders/page.tsx — VERSION AMÉLIORÉE
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
  const [filter, setFilter] = useState<string>('actifs')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', client: '', deadline: '', description: '' })

  const filtered = filter === 'actifs'
    ? tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status))
    : filter === 'tous'
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
      show('AO créé ✓')
      router.push(`/tenders/${(res.data as any).id}`)
    } else {
      show(`Erreur : ${res.error}`)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>

  const stats = {
    actifs: tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status)).length,
    gagnes: tenders.filter(t => t.status === 'gagne').length,
    perdus: tenders.filter(t => t.status === 'perdu').length,
    total: tenders.length,
  }

  return (
    <div>
      {ToastComponent}

      {/* KPIs rapides */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Actifs', value: stats.actifs, color: 'text-blue-400' },
          { label: 'Gagnés', value: stats.gagnes, color: 'text-emerald-400' },
          { label: 'Perdus', value: stats.perdus, color: 'text-red-400' },
          { label: 'Total', value: stats.total, color: 'text-slate-400' },
        ].map(s => (
          <div key={s.label} className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-2">{s.label}</div>
            <div className={`font-mono text-2xl font-medium ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {[
            { key: 'actifs', label: 'Actifs' },
            { key: 'tous', label: 'Tous' },
            { key: 'gagne', label: 'Gagnés' },
            { key: 'perdu', label: 'Perdus' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`text-[10px] font-mono px-3 py-1 rounded-md transition-all ${
                filter === f.key
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>+ Nouvel AO</Button>
      </div>

      {/* Table */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {['Titre', 'Client', 'Deadline', 'Statut', 'Fournisseurs', 'Réponses', 'Devis'].map(h => (
              <th key={h} className="font-mono text-[10px] text-slate-500 uppercase tracking-widest text-left px-3 py-2 border-b border-white/10">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(t => {
            const daysLeft = t.days_remaining
            const deadlineColor = daysLeft !== null && daysLeft <= 3 ? 'text-red-400' : 'text-slate-400'
            const respPct = t.nb_suppliers > 0 ? Math.round((t.nb_responses / t.nb_suppliers) * 100) : 0

            return (
              <tr key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
                className="hover:bg-white/5 cursor-pointer transition-colors group">
                <td className="px-3 py-3 font-semibold border-b border-white/5 group-hover:text-blue-300 transition-colors">
                  {t.title}
                </td>
                <td className="px-3 py-3 text-slate-400 border-b border-white/5">{t.client}</td>
                <td className="px-3 py-3 border-b border-white/5">
                  <span className={`font-mono text-xs ${deadlineColor}`}>
                    {daysLeft !== null ? `${daysLeft}j` : '—'}
                  </span>
                </td>
                <td className="px-3 py-3 border-b border-white/5"><TenderStatusBadge status={t.status} /></td>
                <td className="px-3 py-3 border-b border-white/5"><Badge>{t.nb_suppliers}</Badge></td>
                <td className="px-3 py-3 border-b border-white/5">
                  <Badge color={respPct === 100 ? 'green' : respPct >= 50 ? 'amber' : t.nb_suppliers > 0 ? 'red' : 'gray'}>
                    {t.nb_responses}/{t.nb_suppliers}
                  </Badge>
                </td>
                <td className="px-3 py-3 border-b border-white/5">
                  <Badge color={t.nb_quotes > 0 ? 'green' : 'gray'}>{t.nb_quotes}</Badge>
                </td>
              </tr>
            )
          })}
          {filtered.length === 0 && (
            <tr><td colSpan={7} className="text-center text-slate-500 py-10 text-xs">Aucun AO trouvé</td></tr>
          )}
        </tbody>
      </table>

      {/* Modal création */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouvel appel d'offres">
        <Field label="Titre *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="Ex: Réhabilitation façades R+5" />
        <Field label="Client *" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} placeholder="Ex: Nexity Grand Paris" />
        <Field label="Deadline" value={form.deadline} onChange={v => setForm(f => ({ ...f, deadline: v }))} type="date" />
        <Field label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Description du marché..." />
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
          <Button variant="primary" onClick={handleCreate} loading={creating}>Créer l'AO</Button>
        </div>
      </Modal>
    </div>
  )
}
