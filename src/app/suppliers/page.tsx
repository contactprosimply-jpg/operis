'use client'
// ============================================================
// OPERIS — app/suppliers/page.tsx
// ============================================================

import { useState } from 'react'
import { useSuppliers } from '@/hooks'
import { Button, Modal, Field, Badge, Spinner, useToast } from '@/components/ui'

export default function SuppliersPage() {
  const { suppliers, loading, create, remove } = useSuppliers()
  const { show, ToastComponent } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })

  const handleCreate = async () => {
    if (!form.name || !form.email) return
    setCreating(true)
    const res = await create(form)
    setCreating(false)
    if (res.success) {
      setShowModal(false)
      setForm({ name: '', email: '', phone: '' })
      show('Fournisseur ajouté ✓')
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
      <div className="flex items-center justify-between mb-5">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Fournisseurs</span>
        <Button variant="primary" onClick={() => setShowModal(true)}>+ Ajouter</Button>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {['Nom', 'Email', 'Téléphone'].map(h => (
              <th key={h} className="font-mono text-[10px] text-slate-500 uppercase tracking-widest text-left px-3 py-2 border-b border-white/10">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {suppliers.map(s => (
            <tr key={s.id} className="hover:bg-white/5 transition-colors">
              <td className="px-3 py-2.5 font-semibold border-b border-white/5">{s.name}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-slate-400 border-b border-white/5">{s.email}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-slate-400 border-b border-white/5">{s.phone ?? '—'}</td>
            </tr>
          ))}
          {suppliers.length === 0 && (
            <tr>
              <td colSpan={3} className="text-center text-slate-500 py-10 text-xs">Aucun fournisseur</td>
            </tr>
          )}
        </tbody>
      </table>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouveau fournisseur">
        <Field label="Nom *"      value={form.name}  onChange={v => setForm(f => ({ ...f, name: v }))}  placeholder="Ex: BatiPro SARL" />
        <Field label="Email *"    value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="contact@fournisseur.fr" type="email" />
        <Field label="Téléphone"  value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="01 XX XX XX XX" />
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="ghost"   onClick={() => setShowModal(false)}>Annuler</Button>
          <Button variant="primary" onClick={handleCreate} loading={creating}>Ajouter</Button>
        </div>
      </Modal>
    </div>
  )
}


// ============================================================
// OPERIS — app/layout.tsx
// Layout principal avec navigation sidebar
// ============================================================

// Crée ce fichier : src/app/layout.tsx
// (remplace le layout existant généré par Next.js)
