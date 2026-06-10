'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { authFetch, getAccessToken } from '@/lib/auth-client'
import { TenderStatusBadge, ConsultationStatusBadge, Badge, Button, Modal, Field, Spinner, useToast, Card } from '@/components/ui'
import ConsultationComposeModal, { type ConsultationComposePayload } from '@/components/ConsultationComposeModal'
import SpeechMicButton from '@/components/SpeechMicButton'

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

function documentCategoryStyle(category?: string) {
  switch (category) {
    case 'ao_inbound':
      return { background: 'rgba(59,126,246,0.14)', color: '#60a5fa', border: '1px solid rgba(59,126,246,0.25)' }
    case 'supplier_response':
      return { background: 'rgba(74,222,128,0.14)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }
    case 'consultation_sent':
      return { background: 'rgba(251,191,36,0.14)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }
    case 'relance_sent':
      return { background: 'rgba(248,113,113,0.14)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }
    default:
      return { background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
  }
}

function TenderDocumentRow({
  doc,
  onDownload,
}: {
  doc: {
    id: string
    filename: string
    date?: string | null
    display_title?: string
    category?: string
    supplier_name?: string
    label?: string
  }
  onDownload: () => void
}) {
  const title = doc.display_title
    ?? (doc.supplier_name ? `${doc.supplier_name}` : doc.label ?? 'Document')
  const badgeStyle = documentCategoryStyle(doc.category)

  return (
    <div style={{
      padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, fontFamily: 'DM Sans, system-ui',
          padding: '2px 8px', borderRadius: 4, marginBottom: 6,
          display: 'inline-block', maxWidth: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          ...badgeStyle,
        }}>
          {title}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          📎 {doc.filename}
        </div>
        {doc.date && (
          <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginTop: 2 }}>
            {new Date(doc.date).toLocaleDateString('fr-FR')}
          </div>
        )}
      </div>
      <button type="button" onClick={onDownload}
        style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid rgba(59,126,246,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', flexShrink: 0, fontFamily: 'DM Sans, system-ui' }}>
        Télécharger
      </button>
    </div>
  )
}

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
  const [editingPriceSupplierId, setEditingPriceSupplierId] = useState<string | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)
  const [activeTab, setActiveTab] = useState<'fournisseurs' | 'devis' | 'comparatif' | 'documents' | 'infos'>('fournisseurs')
  const [exportingPdf, setExportingPdf] = useState(false)
  const [retainingQuote, setRetainingQuote] = useState<string | null>(null)
  const [linkedEmails, setLinkedEmails] = useState<any[]>([])
  const [showLinkEmailModal, setShowLinkEmailModal] = useState(false)
  const [unlinkedEmails, setUnlinkedEmails] = useState<any[]>([])
  const [linkingEmail, setLinkingEmail] = useState(false)

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

  const loadLinkedEmails = useCallback(async () => {
    try {
      const res = await authFetch(`/api/mail/emails?tender_id=${id}`)
      const data = await res.json()
      if (data.success) setLinkedEmails(data.data ?? [])
    } catch { /* ignore */ }
  }, [id])

  const openLinkEmailModal = async () => {
    setShowLinkEmailModal(true)
    try {
      const res = await authFetch('/api/mail/emails?unlinked=true&limit=150')
      const data = await res.json()
      if (data.success) setUnlinkedEmails(data.data ?? [])
    } catch {
      showRef.current('Erreur chargement emails')
    }
  }

  const handleLinkEmail = async (emailId: string) => {
    setLinkingEmail(true)
    try {
      const res = await authFetch('/api/mail/emails', {
        method: 'PATCH',
        body: JSON.stringify({ id: emailId, tender_id: id }),
      })
      const data = await res.json()
      if (data.success) {
        await loadLinkedEmails()
        setShowLinkEmailModal(false)
        showRef.current('Email lié à cet AO')
      } else showRef.current(`Erreur : ${data.error}`)
    } catch {
      showRef.current('Erreur liaison email')
    }
    setLinkingEmail(false)
  }

  const handleUnlinkEmail = async (emailId: string) => {
    try {
      const res = await authFetch('/api/mail/emails', {
        method: 'PATCH',
        body: JSON.stringify({ id: emailId, tender_id: null }),
      })
      const data = await res.json()
      if (data.success) {
        await loadLinkedEmails()
        showRef.current('Email délié')
      } else showRef.current(`Erreur : ${data.error}`)
    } catch {
      showRef.current('Erreur déliaison')
    }
  }

  useEffect(() => {
    if (tender) loadLinkedEmails()
  }, [tender, loadLinkedEmails])

  const handleAnalyzeQuotes = async () => {
    setAnalyzingQuotes(true)
    try {
      const res = await authFetch(`/api/tenders/${id}/analyze-quotes`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        await refreshTender()
        const { withPrice = 0, analyzed = 0 } = data.data ?? {}
        show(withPrice > 0
          ? `${withPrice} prix détecté(s) sur ${analyzed} email(s) analysé(s)`
          : analyzed > 0
            ? 'Devis analysés — prix non détecté, saisissez le montant manuellement'
            : 'Aucun email de réponse trouvé pour les fournisseurs consultés')
      } else {
        show(`Erreur : ${data.error}`)
      }
    } catch {
      show('Erreur lors de l\'analyse des devis')
    }
    setAnalyzingQuotes(false)
  }

  const startEditPrice = (supplierId: string, currentPrice: number | null) => {
    setEditingPriceSupplierId(supplierId)
    setPriceInput(currentPrice != null ? String(currentPrice) : '')
  }

  const saveManualPrice = async (supplierId: string, quoteId?: string) => {
    const normalized = priceInput.replace(/\s/g, '').replace(',', '.')
    const price = parseFloat(normalized)
    if (!price || price <= 0) {
      show('Montant invalide')
      return
    }
    setSavingPrice(true)
    try {
      if (quoteId) {
        const res = await authFetch(`/api/quotes/${quoteId}`, {
          method: 'PATCH',
          body: JSON.stringify({ price_ht: price }),
        })
        const data = await res.json()
        if (!data.success) { show(`Erreur : ${data.error}`); return }
      } else {
        const res = await authFetch('/api/quotes', {
          method: 'POST',
          body: JSON.stringify({ tender_id: id, supplier_id: supplierId, price_ht: price }),
        })
        const data = await res.json()
        if (!data.success) { show(`Erreur : ${data.error}`); return }
      }
      setEditingPriceSupplierId(null)
      show('Prix enregistré')
      await refreshTender()
    } catch {
      show('Erreur lors de la sauvegarde')
    }
    setSavingPrice(false)
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
          body: JSON.stringify({ filename: f.name, contentType: f.type, data, source: 'outbound' }),
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

  const handleRetainQuote = async (supplierId: string) => {
    setRetainingQuote(supplierId)
    const res = await authFetch(`/api/tenders/${id}/validate-quote`, {
      method: 'POST',
      body: JSON.stringify({ winner_supplier_id: supplierId }),
    })
    const data = await res.json()
    if (data.success) {
      show('Devis retenu')
      await refreshTender()
    } else show(`Erreur : ${data.error}`)
    setRetainingQuote(null)
  }

  const handleExportPdf = async () => {
    if (!tender) return
    setExportingPdf(true)
    try {
      const exportConsultations = tender.consultations ?? []
      const exportQuotes = [...(tender.quotes ?? [])].sort(
        (a: { price_ht?: string }, b: { price_ht?: string }) =>
          (parseFloat(a.price_ht ?? '0') || 0) - (parseFloat(b.price_ht ?? '0') || 0),
      )
      const exportPrices = exportQuotes
        .filter((q: { price_ht?: string }) => q.price_ht)
        .map((q: { price_ht: string }) => parseFloat(q.price_ht))
      const exportMin = exportPrices.length ? Math.min(...exportPrices) : null
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const margin = 14
      let y = margin
      const line = (text: string, size = 11, bold = false) => {
        doc.setFontSize(size)
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        const lines = doc.splitTextToSize(text, 180)
        doc.text(lines, margin, y)
        y += lines.length * (size * 0.45) + 2
      }

      line('OPERIS — Synthèse appel d\'offres', 16, true)
      line(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 9)
      y += 4
      line(tender.title, 13, true)
      line(`Client : ${tender.client}`)
      if (tender.deadline) line(`Deadline : ${new Date(tender.deadline).toLocaleDateString('fr-FR')}`)
      if (tender.budget_ht) line(`Budget HT : ${parseFloat(tender.budget_ht).toLocaleString('fr-FR')} €`)
      if (tender.zone_geo) line(`Zone : ${tender.zone_geo}`)
      y += 4

      line('Fournisseurs consultés', 12, true)
      exportConsultations.forEach((c: { supplier?: { name?: string }; status: string }) => {
        line(`${c.supplier?.name ?? '—'} — ${c.status}`)
      })
      y += 4

      line('Comparatif devis', 12, true)
      exportQuotes.forEach((q: { supplier?: { name?: string }; price_ht?: string; notes?: string }) => {
        const price = q.price_ht ? `${parseFloat(q.price_ht).toLocaleString('fr-FR')} € HT` : '—'
        const isBest = q.price_ht && exportMin && parseFloat(q.price_ht) === exportMin
        line(`${isBest ? '★ ' : ''}${q.supplier?.name ?? '—'} : ${price}${q.notes ? ` — ${q.notes}` : ''}`)
      })

      if (tender.notes_internes) {
        y += 4
        line('CONFIDENTIEL — Notes internes', 11, true)
        line(tender.notes_internes, 10)
      }

      doc.save(`Operis-AO-${tender.title.slice(0, 40).replace(/[^\w-]/g, '_')}.pdf`)
      show('PDF exporté')
    } catch {
      show('Erreur export PDF')
    }
    setExportingPdf(false)
  }

  const openSimply = () => {
    const url = tender?.simply_chantier_id
      ? `https://simply.nikodex.fr/chantiers/${tender.simply_chantier_id}`
      : 'https://simply.nikodex.fr'
    window.open(url, '_blank', 'noopener,noreferrer')
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

  const quoteBySupplier = new Map<string, any>(quotes.map((q: any) => [q.supplier_id, q]))
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
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={handleExportPdf} loading={exportingPdf}>Exporter PDF</Button>
            <Button variant="ghost" onClick={() => refreshTender()} disabled={refreshing}>Actualiser</Button>
            <Button variant="ghost" onClick={() => setShowEdit(true)}>Modifier</Button>
            <Button variant="danger" onClick={handleDelete}>Supprimer</Button>
          </div>
        </div>
      </Card>

      {tender.status === 'gagne' && (
        <div style={{
          marginBottom: 20, padding: '16px 20px', borderRadius: 12,
          background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 14, color: '#34d399', fontWeight: 600 }}>
            🎉 AO gagné ! Continuez avec Simply pour gérer le chantier.
          </div>
          <Button variant="success" onClick={openSimply}>Ouvrir dans Simply</Button>
        </div>
      )}

      {/* Onglets */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap',
        padding: '4px', background: 'var(--bg-card)', borderRadius: 12,
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
      }}>
        {([
          { id: 'fournisseurs' as const, label: 'Fournisseurs', count: consultations.length },
          { id: 'devis' as const, label: 'Devis', count: quotes.length },
          { id: 'comparatif' as const, label: 'Comparatif', count: quotes.length },
          { id: 'documents' as const, label: 'Documents', count: receivedDocs.length + sentDocs.length },
          { id: 'infos' as const, label: 'Informations', count: 0 },
        ]).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: '1 1 auto', minWidth: 100, padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: 'DM Sans, system-ui', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 500,
              background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
              color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 10, fontFamily: 'DM Mono, monospace',
                background: activeTab === tab.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-hover)',
                padding: '2px 6px', borderRadius: 10,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'infos' && (
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
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Emails liés ({linkedEmails.length})</div>
            <Button variant="ghost" onClick={openLinkEmailModal}>+ Lier un email</Button>
          </div>
          {linkedEmails.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun email lié — associez un devis ou une demande reçue par mail</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {linkedEmails.map((em: any) => (
                <div key={em.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{em.subject}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>{em.from_address}</div>
                  </div>
                  <button type="button" onClick={() => router.push(`/mail?email=${em.id}`)} style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid rgba(59,126,246,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Voir</button>
                  <button type="button" onClick={() => handleUnlinkEmail(em.id)} style={{ fontSize: 11, color: '#f87171', background: 'transparent', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Délier</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {showLinkEmailModal && (
        <Modal open={showLinkEmailModal} onClose={() => setShowLinkEmailModal(false)} title="Lier un email à cet AO">
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unlinkedEmails.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun email non lié</div>
            ) : unlinkedEmails.map((em: any) => (
              <button
                key={em.id}
                type="button"
                disabled={linkingEmail}
                onClick={() => handleLinkEmail(em.id)}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>{em.subject}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{em.from_address}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {activeTab === 'fournisseurs' && (
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
                    minWidth: 120, flexShrink: 0, alignSelf: 'center',
                    padding: '8px 10px', borderRadius: 8, textAlign: 'center',
                    background: price ? (isBest ? 'rgba(16,185,129,0.15)' : 'var(--bg-card)') : 'transparent',
                    border: price ? `1px solid ${isBest ? 'rgba(16,185,129,0.35)' : 'var(--border)'}` : '1px dashed var(--border)',
                  }}>
                    <div style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Devis HT
                    </div>
                    {editingPriceSupplierId === c.supplier_id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          type="text"
                          value={priceInput}
                          onChange={e => setPriceInput(e.target.value)}
                          placeholder="12 500"
                          style={{
                            width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 6,
                            border: '1px solid var(--border-hi)', background: 'var(--bg-primary)',
                            color: 'var(--text-primary)', fontFamily: 'DM Mono, monospace',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            disabled={savingPrice}
                            onClick={() => saveManualPrice(c.supplier_id, quote?.id)}
                            style={{ flex: 1, fontSize: 10, padding: '5px', borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
                          >
                            {savingPrice ? '…' : 'OK'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPriceSupplierId(null)}
                            style={{ fontSize: 10, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditPrice(c.supplier_id, price)}
                        title="Cliquer pour corriger le prix"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%',
                          fontSize: price ? 16 : 12,
                          fontWeight: 700,
                          fontFamily: 'DM Mono, monospace',
                          color: price ? (isBest ? '#34d399' : 'var(--text-primary)') : 'var(--text-muted)',
                        }}
                      >
                        {price ? `${price.toLocaleString('fr-FR')} €` : hasResponse ? 'Saisir prix' : '—'}
                      </button>
                    )}
                    {quote?.notes && price && (
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.3 }}>
                        {quote.notes.length > 40 ? quote.notes.slice(0, 40) + '…' : quote.notes}
                      </div>
                    )}
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
      )}

      {activeTab === 'documents' && (
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
            Aucun document — demande AO, devis fournisseurs et PJ de consultation apparaîtront ici
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Reçus ({receivedDocs.length})
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                Demande AO (DCE, CCTP…) et devis fournisseurs
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {receivedDocs.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune PJ reçue</span>
                ) : receivedDocs.map((doc: any) => (
                  <TenderDocumentRow
                    key={doc.id}
                    doc={doc}
                    onDownload={() => downloadTenderDocument(doc.id, doc.filename)}
                  />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Envoyés ({sentDocs.length})
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                PJ transmises aux fournisseurs (consultation)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sentDocs.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune PJ envoyée</span>
                ) : sentDocs.map((doc: any) => (
                  <TenderDocumentRow
                    key={doc.id}
                    doc={doc}
                    onDownload={() => downloadTenderDocument(doc.id, doc.filename)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {activeTab === 'devis' && quotes.length > 0 && (
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

      {activeTab === 'devis' && quotes.length > 0 && (
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

      {activeTab === 'devis' && quotes.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun devis — consultez les fournisseurs puis cliquez « Analyser les devis PDF »
        </div>
      )}

      {activeTab === 'comparatif' && quotes.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
            Comparatif des devis
          </div>
          <div style={{ marginBottom: 20 }}>
            <svg viewBox="0 0 400 120" width="100%" height="120" style={{ maxWidth: 480 }}>
              {sortedQuotes.map((q: { id: string; price_ht?: string; supplier?: { name?: string } }, i: number) => {
                const price = q.price_ht ? parseFloat(q.price_ht) : 0
                const barMax = maxPrice ?? price
                const h = barMax > 0 ? (price / barMax) * 90 : 0
                const isBest = q.id === bestQuoteId && pricesWithValues.length > 1
                const isWorst = price === maxPrice && pricesWithValues.length > 1 && price !== minPrice
                const x = 20 + i * (360 / sortedQuotes.length)
                const w = Math.max(24, 360 / sortedQuotes.length - 8)
                return (
                  <g key={q.id}>
                    <rect
                      x={x} y={100 - h} width={w} height={h} rx={4}
                      fill={isBest ? '#10b981' : isWorst ? '#ef4444' : 'url(#cmpGrad)'}
                      opacity={isBest ? 1 : 0.85}
                    />
                    <text x={x + w / 2} y={112} textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="DM Mono, monospace">
                      {(q.supplier?.name ?? '').slice(0, 8)}
                    </text>
                  </g>
                )
              })}
              <defs>
                <linearGradient id="cmpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f8ef7" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fournisseur', 'Montant HT', 'Écart %', 'Notes', 'Score', ''].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedQuotes.map((q: { id: string; supplier_id: string; supplier?: { name?: string }; price_ht?: string; notes?: string; score?: number; is_selected?: boolean }) => {
                  const price = q.price_ht ? parseFloat(q.price_ht) : null
                  const isBest = q.id === bestQuoteId && price != null && pricesWithValues.length > 1
                  const isWorst = price != null && price === maxPrice && pricesWithValues.length > 1 && price !== minPrice
                  const gapPct = price && minPrice ? ((price - minPrice) / minPrice) * 100 : null
                  return (
                    <tr key={q.id} style={{
                      borderBottom: '1px solid var(--border)',
                      background: isBest ? 'rgba(16,185,129,0.1)' : isWorst ? 'rgba(239,68,68,0.08)' : 'transparent',
                    }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                        {isBest && <Badge color="green">★ Meilleur</Badge>}
                        {isWorst && <Badge color="red">Plus cher</Badge>}
                        {q.supplier?.name ?? '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', color: isBest ? '#34d399' : 'var(--text-primary)', fontWeight: isBest ? 700 : 400 }}>
                        {price ? `${price.toLocaleString('fr-FR')} €` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: gapPct && gapPct > 0 ? '#f87171' : '#4ade80' }}>
                        {gapPct != null ? `${gapPct > 0 ? '+' : ''}${gapPct.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 160 }}>{q.notes ?? '—'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace' }}>{q.score ?? '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <Button
                          variant={q.is_selected ? 'ghost' : 'success'}
                          loading={retainingQuote === q.supplier_id}
                          disabled={q.is_selected}
                          onClick={() => handleRetainQuote(q.supplier_id)}
                        >
                          {q.is_selected ? 'Retenu' : 'Retenir ce devis'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'comparatif' && quotes.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun devis à comparer — consultez vos fournisseurs d'abord
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Notes internes 🔒</div>
              <SpeechMicButton onTranscript={t => setEditForm(f => ({ ...f, notes_internes: `${f.notes_internes}${f.notes_internes ? ' ' : ''}${t}` }))} />
            </div>
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
