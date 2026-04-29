'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenders } from '@/hooks'
import { Button, Modal, Field, TenderStatusBadge, Badge, Spinner, useToast } from '@/components/ui'

export default function TendersPage() {
  const router = useRouter()
  const { tenders, loading, create } = useTenders()
  const { show, ToastComponent } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState('actifs')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', client: '', deadline: '', description: '' })

  const filtered = filter === 'actifs'
    ? tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status))
    : filter === 'tous' ? tenders
    : tenders.filter(t => t.status === filter)

  const handleCreate = async () => {
    if (!form.title || !form.client) return
    setCreating(true)
    const res = await create({ title: form.title, client: form.client, deadline: form.deadline || undefined, description: form.description || undefined })
    setCreating(false)
    if (res.success) {
      setShowModal(false)
      setForm({ title: '', client: '', deadline: '', description: '' })
      show('AO cree')
      router.push(`/tenders/${(res.data as any).id}`)
    } else show(`Erreur : ${res.error}`)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>

  const stats = {
    actifs: tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status)).length,
    gagnes: tenders.filter(t => t.status === 'gagne').length,
    perdus: tenders.filter(t => t.status === 'perdu').length,
    total: tenders.length,
  }

  return (
    <div>
      {ToastComponent}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Actifs', value: stats.actifs, color: '#60a5fa' },
          { label: 'Gagnes', value: stats.gagnes, color: '#4ade80' },
          { label: 'Perdus', value: stats.perdus, color: '#f87171' },
          { label: 'Total', value: stats.total, color: 'var(--text-secondary)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: s.color, fontFamily: 'DM Mono, monospace' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ key: 'actifs', label: 'Actifs' }, { key: 'tous', label: 'Tous' }, { key: 'gagne', label: 'Gagnes' }, { key: 'perdu', label: 'Perdus' }].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '5px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: 'none',
              background: filter === f.key ? 'var(--accent-soft)' : 'transparent',
              color: filter === f.key ? 'var(--accent)' : 'var(--text-muted)',
              fontFamily: 'DM Sans, system-ui',
            }}>{f.label}</button>
          ))}
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>+ Nouvel AO</Button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Titre', 'Client', 'Deadline', 'Statut', 'Fournisseurs', 'Reponses', 'Devis'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => {
              const respPct = t.nb_suppliers > 0 ? Math.round((t.nb_responses / t.nb_suppliers) * 100) : 0
              return (
                <tr key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <td style={{ padding: '11px 14px', fontWeight: 500 }}>{t.title}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-secondary)' }}>{t.client}</td>
                  <td style={{ padding: '11px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: t.days_remaining !== null && t.days_remaining <= 3 ? '#f87171' : 'var(--text-secondary)' }}>
                    {t.days_remaining !== null ? `${t.days_remaining}j` : '—'}
                  </td>
                  <td style={{ padding: '11px 14px' }}><TenderStatusBadge status={t.status} /></td>
                  <td style={{ padding: '11px 14px' }}><Badge>{t.nb_suppliers}</Badge></td>
                  <td style={{ padding: '11px 14px' }}><Badge color={respPct === 100 ? 'green' : respPct >= 50 ? 'amber' : t.nb_suppliers > 0 ? 'red' : 'gray'}>{t.nb_responses}/{t.nb_suppliers}</Badge></td>
                  <td style={{ padding: '11px 14px' }}><Badge color={t.nb_quotes > 0 ? 'green' : 'gray'}>{t.nb_quotes}</Badge></td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Aucun AO</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouvel appel d'offres">
        <Field label="Titre *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="Ex: Rehabilitation facades R+5" />
        <Field label="Client *" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} placeholder="Ex: Nexity Grand Paris" />
        <Field label="Deadline" value={form.deadline} onChange={v => setForm(f => ({ ...f, deadline: v }))} type="date" />
        <Field label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Description du marche..." />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
          <Button variant="primary" onClick={handleCreate} loading={creating}>Creer l'AO</Button>
        </div>
      </Modal>
    </div>
  )
}
