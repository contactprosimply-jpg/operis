'use client'
// ============================================================
// OPERIS — app/suppliers/page.tsx — V2
// Fournisseurs avec stats et import CSV
// ============================================================

import { useState } from 'react'
import { useSuppliers } from '@/hooks'
import { Button, Modal, Field, Badge, Spinner, useToast } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

export default function SuppliersPage() {
  const { suppliers, loading, create, remove } = useSuppliers()
  const { show, ToastComponent } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    if (!form.name || !form.email) return
    setCreating(true)
    const res = await create(form)
    setCreating(false)
    if (res.success) {
      setShowModal(false)
      setForm({ name: '', email: '', phone: '', notes: '' })
      show('Fournisseur ajouté ✓')
    } else {
      show(`Erreur : ${res.error}`)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>

  return (
    <div>
      {ToastComponent}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Fournisseurs</span>
          <span className="ml-3 font-mono text-xs text-slate-500">({suppliers.length} au total)</span>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => setShowModal(true)}>+ Ajouter</Button>
        </div>
      </div>

      {/* Recherche */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un fournisseur..."
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 transition-colors"
        />
      </div>

      {/* Table */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>{['Nom', 'Email', 'Téléphone', 'Notes', 'Actions'].map(h => (
            <th key={h} className="font-mono text-[10px] text-slate-500 uppercase tracking-widest text-left px-3 py-2 border-b border-white/10">{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {filtered.map(s => (
            <tr key={s.id} className="hover:bg-white/5 transition-colors group">
              <td className="px-3 py-2.5 font-semibold border-b border-white/5">{s.name}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-slate-400 border-b border-white/5">{s.email}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-slate-400 border-b border-white/5">{s.phone ?? '—'}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500 border-b border-white/5 max-w-[200px] truncate">{s.notes ?? '—'}</td>
              <td className="px-3 py-2.5 border-b border-white/5">
                <button
                  onClick={() => {
                    if (confirm(`Supprimer ${s.name} ?`)) {
                      remove(s.id).then(res => {
                        if (res.success) show(`${s.name} supprimé`)
                        else show(`Erreur : ${res.error}`)
                      })
                    }
                  }}
                  className="text-[10px] text-red-400/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={5} className="text-center text-slate-500 py-10 text-xs">
              {search ? 'Aucun résultat' : 'Aucun fournisseur — clique sur "+ Ajouter"'}
            </td></tr>
          )}
        </tbody>
      </table>

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouveau fournisseur">
        <Field label="Nom *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Ex: Tehnomarket d.o.o." />
        <Field label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="contact@fournisseur.com" type="email" />
        <Field label="Téléphone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+381 13 30 77 71" />
        <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Spécialité, pays, langue..." />
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
          <Button variant="primary" onClick={handleCreate} loading={creating}>Ajouter</Button>
        </div>
      </Modal>
    </div>
  )
}
