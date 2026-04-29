'use client'

import { useState } from 'react'
import { useSuppliers } from '@/hooks'
import { Button, Modal, Field, Spinner, useToast } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

export default function SuppliersPage() {
  const { suppliers, loading, create, remove, refetch } = useSuppliers()
  const { show, ToastComponent } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', specialty: '', country: '', language: '', notes: '' })

  const filtered = suppliers.filter((s: any) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    (s.specialty ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    if (!form.name || !form.email) return
    setCreating(true)
    const res = await create(form)
    setCreating(false)
    if (res.success) {
      setShowModal(false)
      setForm({ name: '', email: '', phone: '', specialty: '', country: '', language: '', notes: '' })
      show('Fournisseur ajoute')
    } else show(`Erreur : ${res.error}`)
  }

  const startEdit = (s: any) => {
    setEditingId(s.id)
    setEditForm({ name: s.name, email: s.email, phone: s.phone ?? '', specialty: s.specialty ?? '', country: s.country ?? '', language: s.language ?? '', notes: s.notes ?? '' })
  }

  const saveEdit = async (id: string) => {
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/suppliers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(editForm),
      })
      const data = await res.json()
      if (data.success) {
        setEditingId(null)
        await refetch()
        show('Fournisseur mis a jour')
      } else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setSaving(false)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>

  const inputStyle = (editing: boolean): React.CSSProperties => ({
    width: '100%', background: editing ? 'var(--bg-secondary)' : 'transparent',
    border: editing ? '1px solid var(--border-hi)' : 'none',
    borderRadius: 6, padding: editing ? '4px 8px' : '4px 0',
    fontSize: 12, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none',
  })

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
        placeholder="Rechercher par nom, email, specialite..."
        style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none', marginBottom: 16 }}
        onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
        onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
      />

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Nom', 'Email', 'Tel', 'Specialite', 'Pays', 'Langue', 'Notes', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s: any) => {
              const isEditing = editingId === s.id
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', background: isEditing ? 'var(--bg-hover)' : 'transparent' }}>
                  {['name', 'email', 'phone', 'specialty', 'country', 'language', 'notes'].map(field => (
                    <td key={field} style={{ padding: '8px 12px' }}>
                      {isEditing ? (
                        <input value={editForm[field] ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, [field]: e.target.value }))}
                          style={inputStyle(true)} />
                      ) : (
                        <span style={{ fontSize: 12, color: field === 'name' ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: ['email', 'phone'].includes(field) ? 'DM Mono, monospace' : 'DM Sans, system-ui', fontWeight: field === 'name' ? 500 : 400 }}>
                          {s[field] ?? '—'}
                        </span>
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button variant="success" loading={saving} onClick={() => saveEdit(s.id)}>Sauvegarder</Button>
                        <Button variant="ghost" onClick={() => setEditingId(null)}>Annuler</Button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, opacity: 0 }} className="row-actions"
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}>
                        <button onClick={() => startEdit(s)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Modifier</button>
                        <button onClick={() => { if (confirm(`Supprimer ${s.name} ?`)) remove(s.id).then((res: any) => { if (res.success) show(`${s.name} supprime`); else show(`Erreur : ${res.error}`) }) }}
                          style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                          Supprimer
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                {search ? 'Aucun resultat' : 'Aucun fournisseur — clique sur "+ Ajouter"'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <style>{`.row-actions { transition: opacity 0.15s } tr:hover .row-actions { opacity: 1 !important }`}</style>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouveau fournisseur">
        <Field label="Nom *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Ex: Tehnomarket d.o.o." />
        <Field label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="contact@fournisseur.com" type="email" />
        <Field label="Telephone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+381 13 30 77 71" />
        <Field label="Specialite" value={form.specialty} onChange={v => setForm(f => ({ ...f, specialty: v }))} placeholder="Ex: Menuiseries aluminium" />
        <Field label="Pays" value={form.country} onChange={v => setForm(f => ({ ...f, country: v }))} placeholder="Ex: Serbie" />
        <Field label="Langue" value={form.language} onChange={v => setForm(f => ({ ...f, language: v }))} placeholder="Ex: Serbe / Anglais" />
        <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Observations..." />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
          <Button variant="primary" onClick={handleCreate} loading={creating}>Ajouter</Button>
        </div>
      </Modal>
    </div>
  )
}
