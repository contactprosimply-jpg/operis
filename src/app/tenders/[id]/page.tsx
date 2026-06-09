'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { authFetch, getAccessToken } from '@/lib/auth-client'
import { useRefreshOnFocus } from '@/hooks'
import { TenderStatusBadge, ConsultationStatusBadge, Badge, Button, Modal, Field, Spinner, useToast, Card } from '@/components/ui'
import ConsultationComposeModal, { type ConsultationComposePayload } from '@/components/ConsultationComposeModal'

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
  const showRef = useRef(show)
  const routerRef = useRef(router)
  showRef.current = show
  routerRef.current = router
  const [tender, setTender] = useState<any>(null)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [showConsultModal, setShowConsultModal] = useState(false)
  const [consultPreselect, setConsultPreselect] = useState<string[]>([])
  const [showValidateModal, setShowValidateModal] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [sendingConsult, setSendingConsult] = useState(false)
  const [validatingQuote, setValidatingQuote] = useState(false)
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null)
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [analyzingQuotes, setAnalyzingQuotes] = useState(false)

  // Form édition AO
  const [editForm, setEditForm] = useState({
    title: '', client: '', description: '', deadline: '',
    budget_ht: '', zone_geo: '', maitre_ouvrage: '',
    notes_internes: '', priorite: 'normale', status: 'nouveau',
  })

  const loadTender = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
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
      } else if (!silent) {
        showRef.current(`Erreur : ${data.error}`)
        routerRef.current.push('/tenders')
      }
    } catch {}
    if (silent) setRefreshing(false)
    else setLoading(false)
  }, [id])

  const refreshTender = useCallback(() => loadTender(true), [loadTender])

  const handleAnalyzeQuotes = async () => {
    setAnalyzingQuotes(true)
    try {
      const res = await authFetch(`/api/tenders/${id}`)
      const data = await res.json()
      if (data.success) {
        setTender(data.data)
        const withPrice = (data.data.quotes ?? []).filter((q: any) => q.price_ht).length
        show(withPrice ? `${withPrice} prix détecté(s) depuis les emails/PDF` : 'Analyse terminée — aucun prix trouvé dans les PJ')
      } else {
        show(`Erreur : ${data.error}`)
      }
    } catch {
      show('Erreur lors de l\'analyse des devis')
    }
    setAnalyzingQuotes(false)
  }

  const loadAllSuppliers = useCallback(async () => {
    const res = await authFetch('/api/suppliers')
    const data = await res.json()
    if (data.success) setSuppliers(data.data)
  }, [])

  useEffect(() => {
    setTender(null)
    setLoading(true)
    loadTender(false)
    loadAllSuppliers()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useRefreshOnFocus(refreshTender, !!tender)

  const handleQuickStatus = async (status: string) => {
    if (!tender || tender.status === status) return
    setUpdatingStatus(status)
    const prev = tender.status
    setTender((t: any) => ({ ...t, status }))
    setEditForm(f => ({ ...f, status }))
    try {
      const res = await authFetch(`/api/tenders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      const data = await res.json()
      if (data.success) {
        show('Statut mis à jour')
        await refreshTender()
      } else {
        setTender((t: any) => ({ ...t, status: prev }))
        setEditForm(f => ({ ...f, status: prev }))
        show(`Erreur : ${data.error}`)
      }
    } catch (e: any) {
      setTender((t: any) => ({ ...t, status: prev }))
      setEditForm(f => ({ ...f, status: prev }))
      show(`Erreur : ${e.message}`)
    }
    setUpdatingStatus(null)
  }

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
      if (data.success) {
        setTender((prev: any) => ({ ...prev, ...data.data }))
        setShowEdit(false)
        show('AO mis à jour ✓')
        await refreshTender()
      }
      else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setSavingEdit(false)
  }

  const handleAddSupplier = async (supplierId: string) => {
    const res = await authFetch(`/api/tenders/${id}/suppliers`, { method: 'POST', body: JSON.stringify({ supplier_id: supplierId }) })
    const data = await res.json()
    if (data.success) { show('Fournisseur ajouté'); await refreshTender() }
    else show(`Erreur : ${data.error}`)
  }

  const fileToBase64 = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  const handleUploadTenderDoc = async (files: FileList | File[]) => {
    setUploadingDoc(true)
    try {
      for (const f of Array.from(files)) {
        const data = await fileToBase64(f)
        const res = await authFetch(`/api/tenders/${id}/documents`, {
          method: 'POST',
          body: JSON.stringify({ filename: f.name, contentType: f.type, data, source: 'upload' }),
        })
        const json = await res.json()
        if (!json.success) show(`Erreur : ${json.error}`)
      }
      show('Document(s) ajouté(s)')
      await refreshTender()
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setUploadingDoc(false)
  }

  const openConsultModal = (preselect?: string[]) => {
    setConsultPreselect(preselect ?? [])
    setShowConsultModal(true)
  }

  const handleSendConsult = async (payload: ConsultationComposePayload) => {
    if (payload.supplier_ids.length === 0) return
    setSendingConsult(true)
    try {
      const attachments = await Promise.all(
        payload.files.map(async f => ({
          filename: f.name,
          contentType: f.type || 'application/octet-stream',
          data: await fileToBase64(f),
        })),
      )
      const res = await authFetch(`/api/tenders/${id}/consult`, {
        method: 'POST',
        body: JSON.stringify({
          supplier_ids: payload.supplier_ids,
          subject: payload.subject,
          body: payload.body,
          signature: payload.signature,
          cc: payload.cc,
          attachments,
        }),
      })
      const data = await res.json()
      if (data.success) {
        const errCount = data.data.errors ?? 0
        show(errCount > 0
          ? `${data.data.sent} envoyée(s), ${errCount} erreur(s)`
          : `${data.data.sent} consultation(s) envoyée(s)`)
        setShowConsultModal(false)
        await refreshTender()
      } else show(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      show(`Erreur : ${err.message ?? 'réseau'}`)
    }
    setSendingConsult(false)
  }

  const handleRelaunch = async (supplierId: string) => {
    const res = await authFetch(`/api/tenders/${id}/relaunch`, { method: 'POST', body: JSON.stringify({ supplier_id: supplierId }) })
    const data = await res.json()
    if (data.success) { show('Relance envoyée'); await refreshTender() }
    else show(`Erreur : ${data.error}`)
  }

  const handleRelaunchAll = async () => {
    const res = await authFetch(`/api/tenders/${id}/relaunch`, { method: 'POST', body: JSON.stringify({ all: true }) })
    const data = await res.json()
    if (data.success) { show(`${data.data.sent} relance(s) envoyée(s)`); await refreshTender() }
    else show(`Erreur : ${data.error}`)
  }

  const handleValidateQuote = async () => {
    if (!selectedWinner) return
    setValidatingQuote(true)
    const res = await authFetch(`/api/tenders/${id}/validate-quote`, { method: 'POST', body: JSON.stringify({ winner_supplier_id: selectedWinner }) })
    const data = await res.json()
    if (data.success) { show('Devis validé — notifications envoyées'); setShowValidateModal(false); await refreshTender() }
    else show(`Erreur : ${data.error}`)
    setValidatingQuote(false)
  }

  const downloadTenderDocument = async (docId: string, filename: string) => {
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch(`/api/tenders/${id}/documents/${encodeURIComponent(docId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { show('Fichier indisponible'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch { show('Erreur téléchargement') }
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer cet AO définitivement ?')) return
    const res = await authFetch(`/api/tenders/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { show('AO supprimé'); router.push('/tenders') }
    else show(`Erreur : ${data.error}`)
  }

  if (loading && !tender) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>
  if (!tender) return null

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }
  const label: React.CSSProperties = { fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }
  const value: React.CSSProperties = { fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }

  const consultations = tender.consultations ?? []
  const quotes = tender.quotes ?? []
  const documents = tender.documents ?? { received: [], sent: [] }
  const receivedDocs = documents.received ?? []
  const sentDocs = documents.sent ?? []
  const alreadyAdded = new Set(consultations.map((c: any) => c.supplier_id))
  const availableSuppliers = suppliers.filter(s => !alreadyAdded.has(s.id))

  const prioriteOpt = PRIORITE_OPTIONS.find(p => p.value === tender.priorite)
  const headerBorder = tender.priorite === 'urgente' ? '#ef4444'
    : tender.priorite === 'haute' ? '#f59e0b' : 'var(--border-hi)'

  const quoteBySupplier = new Map(quotes.map((q: any) => [q.supplier_id, q]))
  const sortedQuotes = [...quotes].sort((a: any, b: any) => (parseFloat(a.price_ht) || 0) - (parseFloat(b.price_ht) || 0))
  const bestQuoteId = sortedQuotes.find((q: any) => q.price_ht)?.id
  const pricesWithValues = quotes.filter((q: any) => q.price_ht).map((q: any) => parseFloat(q.price_ht))
  const minPrice = pricesWithValues.length ? Math.min(...pricesWithValues) : null
  const maxPrice = pricesWithValues.length ? Math.max(...pricesWithValues) : null
  const avgPrice = pricesWithValues.length ? pricesWithValues.reduce((a: number, b: number) => a + b, 0) / pricesWithValues.length : null
  const budget = tender.budget_ht ? parseFloat(tender.budget_ht) : null

  const fmtPrice = (v: number | null) => v != null ? `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €` : '—'

  const budgetDelta = (price: number | null) => {
    if (!budget || !price) return null
    const delta = price - budget
    const pct = (delta / budget) * 100
    return { delta, pct }
  }

  return (
    <div className="animate-fade">
      {ToastComponent}

      {/* Header */}
      <Card hover={false} style={{
        padding: '22px 26px', marginBottom: 24,
        background: 'var(--bg-card)',
        border: `1px solid ${headerBorder}`,
        borderLeft: `4px solid ${headerBorder}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <button onClick={() => router.push('/tenders')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans, system-ui' }}>
              ← Retour aux AO
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{tender.title}</h1>
              <TenderStatusBadge status={tender.status} pulse={tender.status === 'urgence'} />
              {prioriteOpt && tender.priorite !== 'normale' && (
                <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: prioriteOpt.color, background: `${prioriteOpt.color}20`, border: `1px solid ${prioriteOpt.color}40`, borderRadius: 6, padding: '3px 9px', fontWeight: 600 }}>{prioriteOpt.label}</span>
              )}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6 }}>{tender.client}</div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Suivi de l&apos;AO</span>
                {refreshing && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>↻ sync</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleQuickStatus(opt.value)}
                    disabled={updatingStatus !== null}
                    style={{
                      padding: '6px 12px', fontSize: 11, cursor: updatingStatus ? 'wait' : 'pointer',
                      borderRadius: 6, fontFamily: 'DM Sans, system-ui', fontWeight: tender.status === opt.value ? 600 : 400,
                      border: tender.status === opt.value ? `2px solid ${opt.color}` : '1px solid var(--border)',
                      background: tender.status === opt.value ? `${opt.color}18` : 'transparent',
                      color: tender.status === opt.value ? opt.color : 'var(--text-secondary)',
                      opacity: updatingStatus && updatingStatus !== opt.value ? 0.45 : 1,
                    }}
                  >
                    {updatingStatus === opt.value ? '…' : opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button variant="ghost" onClick={() => refreshTender()} disabled={refreshing}>Actualiser</Button>
            <Button variant="ghost" onClick={() => setShowEdit(true)}>Modifier</Button>
            <Button variant="danger" onClick={handleDelete}>Supprimer</Button>
          </div>
        </div>
      </Card>

      {/* Infos AO */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Informations de l'AO</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
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
          <div style={{ marginTop: 16, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '14px 16px', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ ...label, color: '#fbbf24', marginBottom: 8, fontWeight: 600 }}>🔒 Notes internes</div>
            <div style={{ fontSize: 13, color: '#fde68a', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{tender.notes_internes}</div>
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
                <Button variant="ghost" onClick={handleAnalyzeQuotes} disabled={analyzingQuotes}>
                  {analyzingQuotes ? 'Analyse…' : 'Analyser les devis PDF'}
                </Button>
                <Button variant="ghost" onClick={() => openConsultModal()}>Envoyer consultation</Button>
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
          <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {consultations.map((c: any, i: number) => {
              const quote = quoteBySupplier.get(c.supplier_id)
              const price = quote?.price_ht ? parseFloat(quote.price_ht) : null
              const hasResponse = c.status === 'repondu' || quote
              const isBest = quote?.id === bestQuoteId && price != null
              const isSelected = quote?.is_selected || selectedWinner === c.supplier_id
              return (
                <div key={c.id} className="animate-slide" style={{
                  display: 'flex', alignItems: 'stretch', gap: 12, padding: '12px 14px',
                  border: `1px solid ${isSelected ? 'rgba(59,126,246,0.35)' : isBest ? 'rgba(16,185,129,0.35)' : 'var(--border)'}`,
                  borderRadius: 10,
                  background: isSelected ? 'rgba(59,126,246,0.06)' : isBest ? 'rgba(16,185,129,0.06)' : 'var(--bg-secondary)',
                  animationDelay: `${i * 50}ms`, opacity: 0,
                }}>
                  <button
                    type="button"
                    title="Sélectionner ce devis"
                    disabled={!hasResponse}
                    onClick={() => setSelectedWinner(prev => prev === c.supplier_id ? null : c.supplier_id)}
                    style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 2,
                      border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border-hi)'}`,
                      background: isSelected ? 'var(--accent)' : 'transparent',
                      cursor: hasResponse ? 'pointer' : 'not-allowed',
                      opacity: hasResponse ? 1 : 0.35,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 12, fontWeight: 700,
                    }}
                  >
                    {isSelected ? '✓' : ''}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{c.supplier?.name ?? '—'}</span>
                      <ConsultationStatusBadge status={c.status} />
                      {isBest && <Badge color="green">Meilleur prix</Badge>}
                      {quote?.is_selected && <Badge color="blue">Retenu</Badge>}
                      {c.relaunch_count > 0 && <Badge color="amber">{c.relaunch_count} relance{c.relaunch_count > 1 ? 's' : ''}</Badge>}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginBottom: 6 }}>
                      {c.supplier?.email ?? '—'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {quote?.received_at
                          ? `Réponse : ${new Date(quote.received_at).toLocaleDateString('fr-FR')}`
                          : c.last_sent_at
                            ? `Envoyé : ${new Date(c.last_sent_at).toLocaleDateString('fr-FR')}`
                            : 'Pas encore contacté'}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {quote?.source_email_id && (
                          <button type="button" onClick={() => router.push(`/mail?email=${quote.source_email_id}`)}
                            style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                            Voir l'email
                          </button>
                        )}
                        {c.status === 'en_attente' && (
                          <Button variant="ghost" onClick={() => openConsultModal([c.supplier_id])} style={{ fontSize: 11, padding: '4px 10px' }}>Envoyer</Button>
                        )}
                        {['envoye', 'relance', 'relance_2'].includes(c.status) && (
                          <Button variant="ghost" onClick={() => handleRelaunch(c.supplier_id)} style={{ fontSize: 11, padding: '4px 10px' }}>Relancer</Button>
                        )}
                      </div>
                    </div>
                    {quote?.notes && !price && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{quote.notes}</div>
                    )}
                  </div>

                  <div style={{
                    minWidth: 110, flexShrink: 0, alignSelf: 'center',
                    padding: '10px 14px', borderRadius: 8, textAlign: 'center',
                    background: price ? (isBest ? 'rgba(16,185,129,0.15)' : 'var(--bg-card)') : 'transparent',
                    border: price ? `1px solid ${isBest ? 'rgba(16,185,129,0.35)' : 'var(--border)'}` : '1px dashed var(--border)',
                  }}>
                    <div style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Devis HT
                    </div>
                    <div style={{
                      fontSize: price ? 16 : 12,
                      fontWeight: 700,
                      fontFamily: 'DM Mono, monospace',
                      color: price ? (isBest ? '#34d399' : 'var(--text-primary)') : 'var(--text-muted)',
                    }}>
                      {price ? `${price.toLocaleString('fr-FR')} €` : hasResponse ? 'À analyser' : '—'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {selectedWinner && (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="success" onClick={() => setShowValidateModal(true)}>✓ Valider le devis sélectionné</Button>
            </div>
          )}
          </>
        )}
      </div>

      {/* Documents & pièces jointes */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Documents & pièces jointes
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="file" multiple style={{ display: 'none' }} id="tender-doc-upload"
              onChange={e => { if (e.target.files?.length) handleUploadTenderDoc(e.target.files); e.target.value = '' }} />
            <Button variant="ghost" loading={uploadingDoc} onClick={() => document.getElementById('tender-doc-upload')?.click()}>
              + Ajouter un document
            </Button>
          </div>
        </div>

        {receivedDocs.length === 0 && sentDocs.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
            Aucun document — les devis fournisseurs et PJ envoyées apparaîtront ici
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Reçus ({receivedDocs.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {receivedDocs.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun devis / PJ reçue</span>
                ) : receivedDocs.map((doc: any) => (
                  <div key={doc.id} style={{
                    padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📎 {doc.filename}
                      </div>
                      <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                        {doc.supplier_name ?? doc.label ?? '—'}
                        {doc.date ? ` · ${new Date(doc.date).toLocaleDateString('fr-FR')}` : ''}
                      </div>
                    </div>
                    <button type="button" onClick={() => downloadTenderDocument(doc.id, doc.filename)}
                      style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid rgba(59,126,246,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', flexShrink: 0, fontFamily: 'DM Sans, system-ui' }}>
                      Télécharger
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Envoyés ({sentDocs.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sentDocs.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune PJ envoyée (consultation)</span>
                ) : sentDocs.map((doc: any) => (
                  <div key={doc.id} style={{
                    padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📎 {doc.filename}
                      </div>
                      <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                        {doc.supplier_name ? `→ ${doc.supplier_name}` : doc.label ?? 'Document AO'}
                        {doc.date ? ` · ${new Date(doc.date).toLocaleDateString('fr-FR')}` : ''}
                      </div>
                    </div>
                    <button type="button" onClick={() => downloadTenderDocument(doc.id, doc.filename)}
                      style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid rgba(59,126,246,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', flexShrink: 0, fontFamily: 'DM Sans, system-ui' }}>
                      Télécharger
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Analyse des devis */}
      {quotes.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Analyse des devis</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '14px 16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Meilleur prix</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#34d399', fontFamily: 'DM Mono, monospace' }}>{fmtPrice(minPrice)}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '14px 16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Prix moyen</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'DM Mono, monospace' }}>{fmtPrice(avgPrice)}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '14px 16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Prix max</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fbbf24', fontFamily: 'DM Mono, monospace' }}>{fmtPrice(maxPrice)}</div>
            </div>
            {budget && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '14px 16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Budget estimé</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', fontFamily: 'DM Mono, monospace' }}>{fmtPrice(budget)}</div>
                {minPrice && budgetDelta(minPrice) && (
                  <div style={{ fontSize: 11, marginTop: 6, color: budgetDelta(minPrice)!.delta <= 0 ? '#4ade80' : '#f87171', fontFamily: 'DM Mono, monospace' }}>
                    Écart meilleur devis : {budgetDelta(minPrice)!.delta > 0 ? '+' : ''}{budgetDelta(minPrice)!.delta.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € ({budgetDelta(minPrice)!.pct > 0 ? '+' : ''}{budgetDelta(minPrice)!.pct.toFixed(1)}%)
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Devis reçus */}
      {quotes.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Devis reçus ({quotes.length})</div>
            <Button variant="success" onClick={() => setShowValidateModal(true)}>✓ Valider un devis</Button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fournisseur', 'Montant HT', 'vs budget', 'Reçu le', 'Pièces jointes', 'Notes'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedQuotes.map((q: any) => {
                  const isBest = q.id === bestQuoteId && pricesWithValues.length > 1
                  const price = q.price_ht ? parseFloat(q.price_ht) : null
                  const delta = budgetDelta(price)
                  return (
                  <tr key={q.id} style={{
                    borderBottom: '1px solid var(--border)',
                    background: isBest ? 'rgba(16,185,129,0.08)' : q.is_selected ? 'rgba(59,126,246,0.08)' : 'transparent',
                    borderLeft: isBest ? '3px solid #10b981' : q.is_selected ? '3px solid var(--accent)' : '3px solid transparent',
                  }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                      {isBest && (
                        <span style={{
                          fontSize: 10, color: '#10b981', marginRight: 8, fontWeight: 700,
                          background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: 5,
                        }}>Meilleur</span>
                      )}
                      {q.is_selected && (
                        <span style={{ fontSize: 10, color: 'var(--accent)', marginRight: 8, fontWeight: 700, background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 5 }}>Retenu</span>
                      )}
                      {q.supplier?.name ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', color: isBest ? '#34d399' : 'var(--text-primary)', fontWeight: isBest ? 700 : 400 }}>
                      {price ? `${price.toLocaleString('fr-FR')} €` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                      {delta ? (
                        <span style={{ color: delta.delta <= 0 ? '#4ade80' : '#f87171' }}>
                          {delta.delta > 0 ? '+' : ''}{delta.pct.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                      {q.received_at ? new Date(q.received_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>
                      {q.source_email_id ? (
                        <button type="button" onClick={() => downloadTenderDocument(`mail:${q.source_email_id}:0`, 'devis')}
                          style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: 'DM Sans, system-ui' }}>
                          📎 Voir docs
                        </button>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 12, maxWidth: 200 }}>{q.notes ?? '—'}</td>
                  </tr>
                )})}
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

      <ConsultationComposeModal
        open={showConsultModal}
        onClose={() => setShowConsultModal(false)}
        tender={tender}
        recipients={consultations.map((c: any) => ({
          supplier_id: c.supplier_id,
          name: c.supplier?.name ?? '—',
          email: c.supplier?.email ?? '',
          status: c.status,
        }))}
        preselectIds={consultPreselect}
        sending={sendingConsult}
        onSend={handleSendConsult}
      />

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
