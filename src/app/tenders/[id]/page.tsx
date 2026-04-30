'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TenderStatusBadge, ConsultationStatusBadge, Badge, Button, Modal, Field, Spinner, useToast } from '@/components/ui'

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = await getToken()
  return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(options.headers ?? {}) } })
}

const STATUS_OPTIONS = [
  { value: 'nouveau', label: 'Nouveau', color: '#60a5fa' },
  { value: 'en_cours', label: 'En cours', color: '#60a5fa' },
  { value: 'urgence', label: 'Urgence', color: '#fbbf24' },
  { value: 'gagne', label: 'Gagné', color: '#4ade80' },
  { value: 'perdu', label: 'Perdu', color: '#f87171' },
  { value: 'cloture', label: 'Clôturé', color: '#6b7280' },
]

const PRIORITE_OPTIONS = [
  { value: 'basse', label: '↓ Basse', color: '#4a5168' },
  { value: 'normale', label: '→ Normale', color: '#8b92a5' },
  { value: 'haute', label: '↑ Haute', color: '#fbbf24' },
  { value: 'urgente', label: '⚡ Urgente', color: '#f87171' },
]

function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
  const color = days < 0 ? '#f87171' : days <= 3 ? '#f87171' : days <= 7 ? '#fbbf24' : '#4ade80'
  return (
    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color, fontWeight: 600 }}>
      {new Date(deadline).toLocaleDateString('fr-FR')}
      {' '}
      <span style={{ fontSize: 11 }}>({days < 0 ? `${Math.abs(days)}j dépassé` : `${days}j restants`})</span>
    </span>
  )
}

export default function TenderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { show, ToastComponent } = useToast()
  const [tender, setTender] = useState<any>(null)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showConsult, setShowConsult] = useState(false)
  const [showConsultModal, setShowConsultModal] = useState(false)
  const [showValidateModal, setShowValidateModal] = useState(false)
  const [consultMsg, setConsultMsg] = useState('')
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [sendingConsult, setSendingConsult] = useState(false)
  const [validatingQuote, setValidatingQuote] = useState(false)
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null)
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false)

  // Form édition AO
  const [editForm, setEditForm] = useState({
    title: '', client: '', description: '', deadline: '',
    budget_ht: '', zone_geo: '', maitre_ouvrage: '',
    notes_internes: '', priorite: 'normale', status: 'nouveau',
  })

  const loadTender = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/tenders/${id}`)
      const data = await res.json()
      if (data.success) {
        setTender(data.data)
        setEditForm({
          title: data.data.title ?? '',
          client: data.data.client ?? '',
          description: data.data.description ?? '',
          deadline: data.data.deadline ?? '',
          budget_ht: data.data.budget_ht ? String(data.data.budget_ht) : '',
          zone_geo: data.data.zone_geo ?? '',
          maitre_ouvrage: data.data.maitre_ouvrage ?? '',
          notes_internes: data.data.notes_internes ?? '',
          priorite: data.data.priorite ?? 'normale',
          status: data.data.status ?? 'nouveau',
        })
      } else { show(`Erreur : ${data.error}`); router.push('/tenders') }
    } catch {}
    setLoading(false)
  }, [id])

  const loadAllSuppliers = useCallback(async () => {
    const res = await authFetch('/api/suppliers')
    const data = await res.json()
    if (data.success) setSuppliers(data.data)
  }, [])

  useEffect(() => { loadTender(); loadAllSuppliers() }, [loadTender, loadAllSuppliers])

  const handleSaveEdit = async () => {
    setSavingEdit(true)
    try {
      const payload: any = {
        title: editForm.title,
        client: editForm.client,
        description: editForm.description || null,
        deadline: editForm.deadline || null,
        budget_ht: editForm.budget_ht ? parseFloat(editForm.budget_ht) : null,
        zone_geo: editForm.zone_geo || null,
        maitre_ouvrage: editForm.maitre_ouvrage || null,
        notes_internes: editForm.notes_internes || null,
        priorite: editForm.priorite,
        status: editForm.status,
      }
      const res = await authFetch(`/api/tenders/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      const data = await res.json()
      if (data.success) { show('AO mis à jour ✓'); setShowEdit(false); await loadTender() }
      else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setSavingEdit(false)
  }

  const handleAddSupplier = async (supplierId: string) => {
    const res = await authFetch(`/api/tenders/${id}/suppliers`, { method: 'POST', body: JSON.stringify({ supplier_id: supplierId }) })
    const data = await res.json()
    if (data.success) { show('Fournisseur ajouté'); await loadTender() }
    else show(`Erreur : ${data.error}`)
  }

  const handleSendConsult = async () => {
    if (selectedSuppliers.length === 0) return
    setSendingConsult(true)
    const res = await authFetch(`/api/tenders/${id}/consult`, { method: 'POST', body: JSON.stringify({ supplier_ids: selectedSuppliers, message: consultMsg }) })
    const data = await res.json()
    if (data.success) { show(`${data.data.sent} consultation(s) envoyée(s)`); setShowConsultModal(false); await loadTender() }
    else show(`Erreur : ${data.error}`)
    setSendingConsult(false)
  }

  const handleRelaunch = async (supplierId: string) => {
    const res = await authFetch(`/api/tenders/${id}/relaunch`, { method: 'POST', body: JSON.stringify({ supplier_id: supplierId }) })
    const data = await res.json()
    if (data.success) { show('Relance envoyée'); await loadTender() }
    else show(`Erreur : ${data.error}`)
  }

  const handleRelaunchAll = async () => {
    const res = await authFetch(`/api/tenders/${id}/relaunch`, { method: 'POST', body: JSON.stringify({ all: true }) })
    const data = await res.json()
    if (data.success) { show(`${data.data.sent} relance(s) envoyée(s)`); await loadTender() }
    else show(`Erreur : ${data.error}`)
  }

  const handleValidateQuote = async () => {
    if (!selectedWinner) return
    setValidatingQuote(true)
    const res = await authFetch(`/api/tenders/${id}/validate-quote`, { method: 'POST', body: JSON.stringify({ winner_supplier_id: selectedWinner }) })
    const data = await res.json()
    if (data.success) { show('Devis validé — notifications envoyées'); setShowValidateModal(false); await loadTender() }
    else show(`Erreur : ${data.error}`)
    setValidatingQuote(false)
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer cet AO définitivement ?')) return
    const res = await authFetch(`/api/tenders/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { show('AO supprimé'); router.push('/tenders') }
    else show(`Erreur : ${data.error}`)
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>
  if (!tender) return null

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }
  const label: React.CSSProperties = { fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }
  const value: React.CSSProperties = { fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }

  const consultations = tender.consultations ?? []
  const quotes = tender.quotes ?? []
  const alreadyAdded = new Set(consultations.map((c: any) => c.supplier_id))
  const availableSuppliers = suppliers.filter(s => !alreadyAdded.has(s.id))

  const prioriteOpt = PRIORITE_OPTIONS.find(p => p.value === tender.priorite)

  return (
    <div>
      {ToastComponent}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div style={{ flex: 1 }}>
          <button onClick={() => router.push('/tenders')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans, system-ui' }}>
            ← Retour aux AO
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{tender.title}</h1>
            <TenderStatusBadge status={tender.status} />
            {prioriteOpt && tender.priorite !== 'normale' && (
              <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: prioriteOpt.color, background: `${prioriteOpt.color}15`, border: `1px solid ${prioriteOpt.color}30`, borderRadius: 5, padding: '2px 7px' }}>{prioriteOpt.label}</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{tender.client}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Button variant="ghost" onClick={() => setShowEdit(true)}>
            ✏️ Modifier
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            🗑 Supprimer
          </Button>
        </div>
      </div>

      {/* Infos AO */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Informations de l'AO</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          <div>
            <div style={label}>Client</div>
            <div style={value}>{tender.client}</div>
          </div>
          <div>
            <div style={label}>Deadline</div>
            <DeadlineBadge deadline={tender.deadline} />
          </div>
          <div>
            <div style={label}>Statut</div>
            <TenderStatusBadge status={tender.status} />
          </div>
          {tender.budget_ht && (
            <div>
              <div style={label}>Budget HT estimé</div>
              <div style={{ ...value, fontFamily: 'DM Mono, monospace', color: '#4ade80' }}>
                {parseFloat(tender.budget_ht).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €
              </div>
            </div>
          )}
          {tender.zone_geo && (
            <div>
              <div style={label}>Zone géographique</div>
              <div style={value}>📍 {tender.zone_geo}</div>
            </div>
          )}
          {tender.maitre_ouvrage && (
            <div>
              <div style={label}>Maître d'ouvrage</div>
              <div style={value}>{tender.maitre_ouvrage}</div>
            </div>
          )}
        </div>
        {tender.description && (
          <div style={{ marginTop: 16 }}>
            <div style={label}>Description</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{tender.description}</div>
          </div>
        )}
        {tender.notes_internes && (
          <div style={{ marginTop: 16, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ ...label, color: '#fbbf24', marginBottom: 6 }}>Notes internes</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{tender.notes_internes}</div>
          </div>
        )}
      </div>

      {/* Fournisseurs / Consultations */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Fournisseurs consultés ({consultations.length})
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => setShowAddSupplierModal(true)}>+ Ajouter</Button>
            {consultations.length > 0 && (
              <>
                <Button variant="ghost" onClick={() => setShowConsultModal(true)}>Envoyer consultation</Button>
                <Button variant="ghost" onClick={handleRelaunchAll}>Relancer tous</Button>
              </>
            )}
          </div>
        </div>

        {consultations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: 12 }}>
            Aucun fournisseur — <button onClick={() => setShowAddSupplierModal(true)} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>en ajouter un</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fournisseur', 'Email', 'Statut', 'Dernière action', 'Relances', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {consultations.map((c: any) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{c.supplier?.name ?? '—'}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>{c.supplier?.email ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}><ConsultationStatusBadge status={c.status} /></td>
                    <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                      {c.last_sent_at ? new Date(c.last_sent_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}><Badge>{c.relaunch_count}</Badge></td>
                    <td style={{ padding: '10px 12px' }}>
                      {['envoye', 'relance', 'relance_2'].includes(c.status) && (
                        <Button variant="ghost" onClick={() => handleRelaunch(c.supplier_id)} style={{ fontSize: 11, padding: '4px 10px' }}>Relancer</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Devis reçus */}
      {quotes.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Devis reçus ({quotes.length})</div>
            <Button variant="success" onClick={() => setShowValidateModal(true)}>✓ Valider un devis</Button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fournisseur', 'Montant HT', 'Reçu le', 'Notes'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map((q: any, i: number) => (
                  <tr key={q.id} style={{ borderBottom: '1px solid var(--border)', background: i === 0 ? 'rgba(34,197,94,0.04)' : 'transparent' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                      {i === 0 && <span style={{ fontSize: 10, color: '#4ade80', marginRight: 6 }}>★</span>}
                      {q.supplier?.name ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', color: i === 0 ? '#4ade80' : 'var(--text-primary)', fontWeight: i === 0 ? 600 : 400 }}>
                      {q.price_ht ? `${parseFloat(q.price_ht).toLocaleString('fr-FR')} €` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                      {q.received_at ? new Date(q.received_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{q.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === MODAL MODIFIER AO === */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Modifier l'appel d'offres">
        <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
          {/* Statut */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Statut</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setEditForm(f => ({ ...f, status: opt.value }))}
                  style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: `1px solid ${editForm.status === opt.value ? opt.color : 'var(--border-hi)'}`, background: editForm.status === opt.value ? `${opt.color}15` : 'transparent', color: editForm.status === opt.value ? opt.color : 'var(--text-muted)', fontFamily: 'DM Sans, system-ui', transition: 'all 0.12s' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priorité */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Priorité</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {PRIORITE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setEditForm(f => ({ ...f, priorite: opt.value }))}
                  style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: `1px solid ${editForm.priorite === opt.value ? opt.color : 'var(--border-hi)'}`, background: editForm.priorite === opt.value ? `${opt.color}15` : 'transparent', color: editForm.priorite === opt.value ? opt.color : 'var(--text-muted)', fontFamily: 'DM Sans, system-ui', transition: 'all 0.12s' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Titre *" value={editForm.title} onChange={v => setEditForm(f => ({ ...f, title: v }))} placeholder="Titre du marché" />
            </div>
            <Field label="Client *" value={editForm.client} onChange={v => setEditForm(f => ({ ...f, client: v }))} placeholder="Nom du client" />
            <Field label="Maître d'ouvrage" value={editForm.maitre_ouvrage} onChange={v => setEditForm(f => ({ ...f, maitre_ouvrage: v }))} placeholder="Ex: Ville de Paris" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Deadline" value={editForm.deadline} onChange={v => setEditForm(f => ({ ...f, deadline: v }))} type="date" />
            <Field label="Budget HT estimé (€)" value={editForm.budget_ht} onChange={v => setEditForm(f => ({ ...f, budget_ht: v }))} placeholder="Ex: 150000" type="number" />
          </div>

          <Field label="Zone géographique" value={editForm.zone_geo} onChange={v => setEditForm(f => ({ ...f, zone_geo: v }))} placeholder="Ex: Île-de-France, Seine-Saint-Denis" />

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Description</div>
            <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Description du marché..."
              rows={3}
              style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Notes internes 🔒</div>
            <textarea value={editForm.notes_internes} onChange={e => setEditForm(f => ({ ...f, notes_internes: e.target.value }))} placeholder="Notes privées — non visibles par les fournisseurs..."
              rows={3}
              style={{ width: '100%', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <Button variant="ghost" onClick={() => setShowEdit(false)}>Annuler</Button>
          <Button variant="primary" loading={savingEdit} onClick={handleSaveEdit}>Sauvegarder</Button>
        </div>
      </Modal>

      {/* === MODAL AJOUTER FOURNISSEUR === */}
      <Modal open={showAddSupplierModal} onClose={() => setShowAddSupplierModal(false)} title="Ajouter un fournisseur">
        {availableSuppliers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>
            Tous vos fournisseurs sont déjà ajoutés à cet AO.
          </div>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {availableSuppliers.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{s.name}</div>
                  <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{s.email}</div>
                </div>
                <Button variant="ghost" onClick={() => { handleAddSupplier(s.id); setShowAddSupplierModal(false) }} style={{ fontSize: 11 }}>+ Ajouter</Button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => router.push('/suppliers')} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
            + Créer un nouveau fournisseur →
          </button>
        </div>
      </Modal>

      {/* === MODAL CONSULTATION === */}
      <Modal open={showConsultModal} onClose={() => setShowConsultModal(false)} title="Envoyer la consultation">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sélectionner les fournisseurs</div>
          {consultations.filter((c: any) => c.status === 'en_attente').map((c: any) => (
            <div key={c.id} onClick={() => setSelectedSuppliers(prev => prev.includes(c.supplier_id) ? prev.filter(id => id !== c.supplier_id) : [...prev, c.supplier_id])}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${selectedSuppliers.includes(c.supplier_id) ? 'var(--accent)' : 'var(--border-hi)'}`, background: selectedSuppliers.includes(c.supplier_id) ? 'var(--accent)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {selectedSuppliers.includes(c.supplier_id) && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{c.supplier?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>{c.supplier?.email}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Message personnalisé (optionnel)</div>
          <textarea value={consultMsg} onChange={e => setConsultMsg(e.target.value)} rows={4} placeholder="Message additionnel..."
            style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setShowConsultModal(false)}>Annuler</Button>
          <Button variant="primary" loading={sendingConsult} onClick={handleSendConsult} disabled={selectedSuppliers.length === 0}>
            Envoyer ({selectedSuppliers.length})
          </Button>
        </div>
      </Modal>

      {/* === MODAL VALIDER DEVIS === */}
      <Modal open={showValidateModal} onClose={() => setShowValidateModal(false)} title="Valider un devis">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Le fournisseur retenu recevra une confirmation. Les autres recevront un email de refus automatique.
          </div>
          {quotes.map((q: any) => (
            <div key={q.id} onClick={() => setSelectedWinner(q.supplier_id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: 6, cursor: 'pointer', border: `1px solid ${selectedWinner === q.supplier_id ? 'var(--accent)' : 'var(--border-hi)'}`, background: selectedWinner === q.supplier_id ? 'var(--accent-soft)' : 'transparent', transition: 'all 0.12s' }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${selectedWinner === q.supplier_id ? 'var(--accent)' : 'var(--border-hi)'}`, background: selectedWinner === q.supplier_id ? 'var(--accent)' : 'transparent', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{q.supplier?.name}</div>
                <div style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#4ade80' }}>
                  {q.price_ht ? `${parseFloat(q.price_ht).toLocaleString('fr-FR')} € HT` : 'Prix non renseigné'}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setShowValidateModal(false)}>Annuler</Button>
          <Button variant="success" loading={validatingQuote} onClick={handleValidateQuote} disabled={!selectedWinner}>
            ✓ Valider et notifier
          </Button>
        </div>
      </Modal>
    </div>
  )
}
