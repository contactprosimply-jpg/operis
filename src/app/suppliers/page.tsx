'use client'

import { useState } from 'react'
import { useSuppliers } from '@/hooks'
import { Button, Modal, Field, Spinner, useToast } from '@/components/ui'

export default function SuppliersPage() {
  const { suppliers, loading, create, remove } = useSuppliers()
  const { show, ToastComponent } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })

  const filtered = suppliers.filter((s: any) =>
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
      show('Fournisseur ajoute')
    } else show(`Erreur : ${res.error}`)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>

  return (
    <div>
      {ToastComponent}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Fournisseurs</span>
          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>({suppliers.length})</span>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>+ Ajouter</Button>
      </div>

      <input type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher un fournisseur..."
        style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none', marginBottom: 16, transition: 'border-color 0.12s' }}
        onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
        onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
      />

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Nom', 'Email', 'Telephone', 'Notes', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s: any) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                <td style={{ padding: '11px 14px', fontWeight: 500 }}>{s.name}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{s.email}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{s.phone ?? '—'}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.notes ?? '—'}</td>
                <td style={{ padding: '11px 14px' }}>
                  <button onClick={() => { if (confirm(`Supprimer ${s.name} ?`)) remove(s.id).then((res: any) => { if (res.success) show(`${s.name} supprime`); else show(`Erreur : ${res.error}`) }) }}
                    style={{ fontSize: 11, color: 'rgba(239,68,68,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#f87171'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(239,68,68,0.4)'}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                {search ? 'Aucun resultat' : 'Aucun fournisseur — clique sur "+ Ajouter"'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouveau fournisseur">
        <Field label="Nom *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Ex: Tehnomarket d.o.o." />
        <Field label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="contact@fournisseur.com" type="email" />
        <Field label="Telephone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+381 13 30 77 71" />
        <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Specialite, pays, langue..." />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
          <Button variant="primary" onClick={handleCreate} loading={creating}>Ajouter</Button>
        </div>
      </Modal>
    </div>
  )
}
