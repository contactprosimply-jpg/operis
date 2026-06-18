'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTenders } from '@/hooks'
import { authFetch } from '@/lib/auth-client'
import { useAuth } from '@/components/AuthProvider'
import TenderOriginBadge from '@/components/TenderOriginBadge'
import type { OrganizationPayload } from '@/lib/organization'
import {
  creatorColumnLabel,
  getTenderAssigneeLabel,
  getTenderCreatorLabel,
} from '@/lib/tender-member-label'
import { Button, Modal, Field, Badge, useToast, Card, KpiCard, tableRowHoverHandlers, TableSkeleton } from '@/components/ui'
import type { TenderStatus } from '@/types/database'

const STATUS_OPTIONS: { value: TenderStatus; label: string }[] = [
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'urgence', label: 'Urgence' },
  { value: 'gagne', label: 'Gagné' },
  { value: 'perdu', label: 'Perdu' },
  { value: 'cloture', label: 'Clôturé' },
]

const PRIORITE_LABEL: Record<string, { label: string; color: string; icon: string }> = {
  basse: { label: 'Basse', color: '#475569', icon: '↓' },
  normale: { label: 'Normale', color: '#94a3b8', icon: '→' },
  haute: { label: 'Haute', color: '#f59e0b', icon: '↑' },
  urgente: { label: 'Urgente', color: '#ef4444', icon: '⚡' },
}

function deadlineColor(days: number | null) {
  if (days === null) return 'var(--text-secondary)'
  if (days < 0 || days <= 3) return '#f87171'
  if (days <= 7) return '#fbbf24'
  return '#34d399'
}

function formatBudget(v?: number | null) {
  if (!v) return '—'
  return `${v.toLocaleString('fr-FR')} €`
}

export default function TendersPage() {
  const router = useRouter()
  const { session } = useAuth()
  const currentUserId = session?.user?.id
  const { tenders, loading, refreshing, create, markStatus } = useTenders()
  const { show, ToastComponent } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState('actifs')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', client: '', deadline: '', description: '' })
  const [org, setOrg] = useState<OrganizationPayload | null>(null)

  useEffect(() => {
    authFetch('/api/organization')
      .then(r => r.json())
      .then(data => { if (data.success) setOrg(data.data ?? null) })
      .catch(() => {})
  }, [])

  const inTeam = !!org?.members?.length
  const showCreatorColumn = inTeam || tenders.some(t => !!t.creator_label)
  const tableColCount = showCreatorColumn ? 10 : 9

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

  const handleStatusChange = async (e: React.MouseEvent | React.ChangeEvent, tenderId: string, status: TenderStatus) => {
    e.stopPropagation()
    const res = await markStatus(tenderId, status)
    if (res.success) show('Statut mis à jour')
    else show(`Erreur : ${res.error}`)
  }

  if (loading) return (
    <div className="animate-fade-in">
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[0,1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }} />)}
      </div>
      <Card hover={false}><TableSkeleton rows={8} cols={9} /></Card>
    </div>
  )

  const stats = {
    actifs: tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status)).length,
    gagnes: tenders.filter(t => t.status === 'gagne').length,
    perdus: tenders.filter(t => t.status === 'perdu').length,
    total: tenders.length,
  }

  const filters = [{ key: 'actifs', label: 'Actifs' }, { key: 'tous', label: 'Tous' }, { key: 'gagne', label: 'Gagnes' }, { key: 'perdu', label: 'Perdus' }]

  return (
    <div className="animate-fade">
      {ToastComponent}

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KpiCard label="Actifs" value={stats.actifs} color="blue" delay={0} />
        <KpiCard label="Gagnes" value={stats.gagnes} color="green" delay={60} />
        <KpiCard label="Perdus" value={stats.perdus} color="amber" delay={120} />
        <KpiCard label="Total" value={stats.total} color="purple" delay={180} />
      </div>

      <div className="page-toolbar">
        <div className="page-toolbar-tabs">
          {filters.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '8px 16px', fontSize: 12, cursor: 'pointer', border: 'none', background: 'transparent',
              color: filter === f.key ? 'var(--accent)' : 'var(--text-muted)',
              fontFamily: 'DM Sans, system-ui', fontWeight: filter === f.key ? 600 : 400,
              borderBottom: filter === f.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.2s ease',
            }}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {refreshing && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>↻ sync</span>}
          <span data-tour="tenders-create" style={{ display: 'inline-flex' }}>
            <Button variant="primary" onClick={() => setShowModal(true)}>+ Nouvel AO</Button>
          </span>
        </div>
      </div>

      <Card hover={false} style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll">
        <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                'Titre', 'Client', 'Deadline', 'Budget HT', 'Priorite', 'Statut',
                ...(showCreatorColumn ? ['Créé par'] : []),
                'Fournisseurs', 'Reponses', 'Devis',
              ].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => {
              const respPct = t.nb_suppliers > 0 ? Math.round((t.nb_responses / t.nb_suppliers) * 100) : 0
              const priorite = PRIORITE_LABEL[t.priorite ?? 'normale'] ?? PRIORITE_LABEL.normale
              const rowHandlers = tableRowHoverHandlers(t.status)
              const creatorLabel = t.creator_label ?? getTenderCreatorLabel(t, currentUserId, org)
              const assigneeLabel = t.assignee_label ?? getTenderAssigneeLabel(t, currentUserId, org)
              return (
                <tr key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
                  className="animate-fade"
                  style={{
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    borderLeft: '3px solid transparent',
                    background: i % 2 === 1 ? 'rgba(148,163,184,0.02)' : 'transparent',
                    animationDelay: `${i * 30}ms`,
                  }}
                  {...rowHandlers}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    {(creatorLabel || assigneeLabel) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {creatorLabel && (
                          <TenderOriginBadge label={creatorLabel} type="creator" />
                        )}
                        {assigneeLabel && (
                          <TenderOriginBadge label={assigneeLabel} type="assigned" />
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{t.client}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: deadlineColor(t.days_remaining), fontWeight: t.days_remaining !== null && t.days_remaining <= 3 ? 600 : 400 }}>
                    {t.days_remaining !== null ? `${t.days_remaining}j` : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#34d399' }}>{formatBudget(t.budget_ht)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: priorite.color, fontWeight: 600 }}>
                      {priorite.icon} {priorite.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                    <select
                      value={t.status}
                      onChange={e => handleStatusChange(e, t.tender_id, e.target.value as TenderStatus)}
                      style={{
                        fontSize: 11, fontFamily: 'DM Sans, system-ui', fontWeight: 500,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '5px 8px', color: 'var(--text-primary)', cursor: 'pointer',
                      }}
                    >
                      {STATUS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  {showCreatorColumn && (
                    <td style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'DM Sans, system-ui' }}>
                      {creatorLabel ?? creatorColumnLabel(t, currentUserId, org)}
                    </td>
                  )}
                  <td style={{ padding: '12px 14px' }}><Badge>{t.nb_suppliers}</Badge></td>
                  <td style={{ padding: '12px 14px' }}><Badge color={respPct === 100 ? 'green' : respPct >= 50 ? 'amber' : t.nb_suppliers > 0 ? 'red' : 'gray'}>{t.nb_responses}/{t.nb_suppliers}</Badge></td>
                  <td style={{ padding: '12px 14px' }}><Badge color={t.nb_quotes > 0 ? 'green' : 'gray'} glow={t.nb_quotes > 0}>{t.nb_quotes}</Badge></td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={tableColCount} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Aucun AO</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouvel appel d'offres" size="lg">
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
