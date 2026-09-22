'use client'

import { useState } from 'react'
import { useSuppliers } from '@/hooks'
import { Button, Modal, Field, Spinner, useToast } from '@/components/ui'
import { authFetch } from '@/lib/auth-client'
import { SupplierHistoryModal } from '@/components/suppliers/SupplierHistoryModal'

const SUPPLIER_FIELDS: [string, string][] = [
  ['name', 'Nom'],
  ['email', 'Email'],
  ['additionalEmails', 'Emails secondaires'],
  ['phone', 'Téléphone'],
  ['specialty', 'Spécialité'],
  ['country', 'Pays'],
  ['language', 'Langue'],
  ['notes', 'Notes'],
]

export default function SuppliersPage() {
  const { suppliers, loading, create, remove, refetch } = useSuppliers()
  const { show, ToastComponent } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', additionalEmails: '', phone: '', specialty: '', country: '', language: '', notes: '' })
  const [historyTarget, setHistoryTarget] = useState<{ id: string; name: string } | null>(null)

  const filtered = suppliers.filter((s: any) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    (s.specialty ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const parseEmailList = (raw: string): string[] => raw.split(',').map(e => e.trim()).filter(Boolean)

  const handleCreate = async () => {
    if (!form.name || !form.email) return
    setCreating(true)
    const { additionalEmails, ...rest } = form
    const res = await create({ ...rest, additional_emails: parseEmailList(additionalEmails) })
    setCreating(false)
    if (res.success) {
      setShowModal(false)
      setForm({ name: '', email: '', additionalEmails: '', phone: '', specialty: '', country: '', language: '', notes: '' })
      show('Fournisseur ajouté')
    } else show(`Erreur : ${res.error}`)
  }

  const startEdit = (s: any) => {
    setEditingId(s.id)
    setEditForm({
      name: s.name, email: s.email, additionalEmails: (s.additional_emails ?? []).join(', '),
      phone: s.phone ?? '', specialty: s.specialty ?? '', country: s.country ?? '', language: s.language ?? '', notes: s.notes ?? '',
    })
  }

  const saveEdit = async (id: string) => {
    setSaving(true)
    try {
      const { additionalEmails, ...rest } = editForm
      const res = await authFetch(`/api/suppliers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...rest, additional_emails: parseEmailList(additionalEmails ?? '') }),
      })
      const data = await res.json()
      if (data.success) {
        setEditingId(null)
        await refetch()
        show('Fournisseur mis à jour')
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
        <span data-tour="suppliers-add" style={{ display: 'inline-flex' }}>
          <Button variant="primary" onClick={() => setShowModal(true)}>+ Ajouter</Button>
        </span>
      </div>

      <input type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher par nom, email, spécialité..."
        style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none', marginBottom: 16 }}
        onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
        onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
      />

      {/* Téléphone : cartes (le tableau à 9 colonnes était rogné, actions et téléphone inaccessibles). */}
      <div className="suppliers-mobile-list">
        {filtered.map((s: any) => {
          const isEditing = editingId === s.id
          const meta = [s.specialty, s.country, s.language].filter(Boolean).join(' · ')
          return (
            <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {SUPPLIER_FIELDS.map(([field, label]) => (
                    <label key={field} style={{ display: 'block' }}>
                      <span style={{ display: 'block', fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</span>
                      <input
                        value={editForm[field] ?? ''}
                        onChange={e => setEditForm((f: any) => ({ ...f, [field]: e.target.value }))}
                        placeholder={field === 'additionalEmails' ? 'email1@x.com, email2@x.com' : undefined}
                        inputMode={field === 'phone' ? 'tel' : field === 'email' || field === 'additionalEmails' ? 'email' : undefined}
                        autoCapitalize="none"
                        style={{ ...inputStyle(true), padding: '10px 12px', minHeight: 44 }}
                      />
                    </label>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <Button variant="success" loading={saving} onClick={() => saveEdit(s.id)} style={{ flex: 1, justifyContent: 'center' }}>Sauvegarder</Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)} style={{ flex: 1, justifyContent: 'center' }}>Annuler</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{s.name}</div>
                  <a href={`mailto:${s.email}`} style={{ display: 'block', marginTop: 4, fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--accent)', textDecoration: 'none', overflowWrap: 'anywhere', padding: '6px 0' }}>{s.email}</a>
                  {(s.additional_emails ?? []).length > 0 && (
                    <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{(s.additional_emails ?? []).join(', ')}</div>
                  )}
                  {s.phone && (
                    <a href={`tel:${String(s.phone).replace(/\s+/g, '')}`} style={{ display: 'inline-block', marginTop: 2, fontSize: 13, fontFamily: 'DM Mono, monospace', color: 'var(--text-primary)', textDecoration: 'none', padding: '6px 0' }}>📞 {s.phone}</a>
                  )}
                  {meta && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{meta}</div>}
                  {s.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, overflowWrap: 'anywhere' }}>{s.notes}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <Button variant="ghost" onClick={() => setHistoryTarget({ id: s.id, name: s.name })} style={{ flex: 1, justifyContent: 'center' }}>Historique</Button>
                    <Button variant="ghost" onClick={() => startEdit(s)} style={{ flex: 1, justifyContent: 'center' }}>Modifier</Button>
                    <Button
                      variant="danger"
                      onClick={() => { if (confirm(`Supprimer ${s.name} ?`)) remove(s.id).then((res: any) => { if (res.success) show(`${s.name} supprimé`); else show(`Erreur : ${res.error}`) }) }}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Supprimer
                    </Button>
                  </div>
                </>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {search ? 'Aucun résultat' : 'Aucun fournisseur — appuyez sur « + Ajouter »'}
          </div>
        )}
      </div>

      <div className="suppliers-table-view" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Nom', 'Email', 'Emails secondaires', 'Tel', 'Spécialité', 'Pays', 'Langue', 'Notes', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s: any) => {
              const isEditing = editingId === s.id
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', background: isEditing ? 'var(--bg-hover)' : 'transparent' }}>
                  {['name', 'email', 'additionalEmails', 'phone', 'specialty', 'country', 'language', 'notes'].map(field => (
                    <td key={field} style={{ padding: '8px 12px' }}>
                      {isEditing ? (
                        <input value={editForm[field] ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, [field]: e.target.value }))}
                          placeholder={field === 'additionalEmails' ? 'email1@x.com, email2@x.com' : undefined}
                          style={inputStyle(true)} />
                      ) : field === 'additionalEmails' ? (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace' }}>
                          {(s.additional_emails ?? []).join(', ') || '—'}
                        </span>
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
                        <button onClick={() => setHistoryTarget({ id: s.id, name: s.name })} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Historique</button>
                        <button onClick={() => startEdit(s)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Modifier</button>
                        <button onClick={() => { if (confirm(`Supprimer ${s.name} ?`)) remove(s.id).then((res: any) => { if (res.success) show(`${s.name} supprimé`); else show(`Erreur : ${res.error}`) }) }}
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
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                {search ? 'Aucun résultat' : 'Aucun fournisseur — cliquez sur "+ Ajouter"'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <style>{`.row-actions { transition: opacity 0.15s } tr:hover .row-actions { opacity: 1 !important }`}</style>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouveau fournisseur">
        <Field label="Nom *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Ex: Tehnomarket d.o.o." />
        <Field label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="contact@fournisseur.com" type="email" />
        <Field label="Emails secondaires" value={form.additionalEmails} onChange={v => setForm(f => ({ ...f, additionalEmails: v }))} placeholder="email2@x.com, email3@x.com" />
        <Field label="Téléphone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+381 13 30 77 71" />
        <Field label="Spécialité" value={form.specialty} onChange={v => setForm(f => ({ ...f, specialty: v }))} placeholder="Ex: Menuiseries aluminium" />
        <Field label="Pays" value={form.country} onChange={v => setForm(f => ({ ...f, country: v }))} placeholder="Ex: Serbie" />
        <Field label="Langue" value={form.language} onChange={v => setForm(f => ({ ...f, language: v }))} placeholder="Ex: Serbe / Anglais" />
        <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Observations..." />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
          <Button variant="primary" onClick={handleCreate} loading={creating}>Ajouter</Button>
        </div>
      </Modal>

      <SupplierHistoryModal
        open={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        supplierId={historyTarget?.id ?? null}
        supplierName={historyTarget?.name}
      />
    </div>
  )
}
