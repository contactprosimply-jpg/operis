'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { authFetch, getAccessToken } from '@/lib/auth-client'
import { TenderStatusBadge, ConsultationStatusBadge, Badge, Button, Modal, Field, Spinner, useToast, Card } from '@/components/ui'
import ConsultationComposeModal, { type ConsultationComposePayload } from '@/components/ConsultationComposeModal'
import MailComposePopup from '@/components/mail/MailComposePopup'
import { getSignatureData, stripSignatureFromBody } from '@/lib/email-signature'
import type { Email } from '@/types/database'
import {
  type OperisContact,
  formatContactAddress,
  pickPrimaryTenderContact,
} from '@/lib/contacts'
import SpeechMicButton from '@/components/SpeechMicButton'
import { memberDisplayName } from '@/lib/family'
import type { OrganizationPayload } from '@/lib/organization'
import { useAuth } from '@/components/AuthProvider'
import TenderOriginBadge from '@/components/TenderOriginBadge'
import TenderDocumentsTab, { DocumentFileActions } from '@/components/tender/TenderDocumentsTab'
import { readCache, writeCache, cacheKeyForUser } from '@/lib/client-cache'
import { getTenderAssigneeLabel, getTenderCreatorLabel } from '@/lib/tender-member-label'
import { groupEmailsByThread, computeThreadStatus, THREAD_STATUS_META } from '@/lib/email-threading'
import { AO_CATEGORY_BADGE, type AoKeywordCategory } from '@/lib/ao-email-analysis'
import { normalizeAttachments } from '@/lib/mail-attachments'
import { isTenderSetupQuery } from '@/lib/tender-setup-nav'

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

function appendSignatureToBody(body: string, signatureHtml: string, signatureText: string): string {
  if (!signatureHtml.trim()) return body
  const isHtml = (body.includes('<') && body.includes('>')) || signatureHtml.includes('<')
  if (isHtml) {
    const block = body.trim()
    const hr = '<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0">'
    return block ? `${block}${hr}${signatureHtml}` : signatureHtml
  }
  const plainSig = signatureText.replace(/^\n\n--\n/, '').trim()
  return body.trim() ? `${body.trim()}\n\n--\n${plainSig}` : plainSig
}

function isElectronDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.operisDesktop
}

/** true si le lien est une URL cloud ouvrable dans un onglet (par opposition à un chemin
 *  local/UNC, bloqué par le navigateur en dehors d'Electron). */
function isHttpsDossierUrl(value: string): boolean {
  return /^https:\/\//i.test(value.trim())
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
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
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const router = useRouter()
  const searchParams = useSearchParams()
  const setupOpenedRef = useRef(false)
  const { userId, ready } = useAuth()
  const currentUserId = userId
  const { show, ToastComponent } = useToast()
  const showRef = useRef(show)
  const routerRef = useRef(router)
  showRef.current = show
  routerRef.current = router
  const [tender, setTender] = useState<any>(null)
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [isNewAoSetup, setIsNewAoSetup] = useState(false)
  const [showConsultModal, setShowConsultModal] = useState(false)
  const [consultPreselect, setConsultPreselect] = useState<string[]>([])
  const [showValidateModal, setShowValidateModal] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [sendingConsult, setSendingConsult] = useState(false)
  const [validatingQuote, setValidatingQuote] = useState(false)
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null)
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [showOptionalPng, setShowOptionalPng] = useState(false)
  const [pngAttachmentAction, setPngAttachmentAction] = useState<string | null>(null)
  const [analyzingQuotes, setAnalyzingQuotes] = useState(false)
  const [editingPriceSupplierId, setEditingPriceSupplierId] = useState<string | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)
  const [activeTab, setActiveTab] = useState<'fournisseurs' | 'devis' | 'comparatif' | 'documents' | 'mails' | 'infos'>('fournisseurs')
  const [mailViewerOpen, setMailViewerOpen] = useState(false)
  const [mailViewerLoading, setMailViewerLoading] = useState(false)
  const [mailViewerEmail, setMailViewerEmail] = useState<Email | null>(null)
  const [mailComposing, setMailComposing] = useState(false)
  const [mailCompose, setMailCompose] = useState({ to: '', cc: '', bcc: '', subject: '', body: '' })
  const [mailAttachments, setMailAttachments] = useState<File[]>([])
  const [mailSending, setMailSending] = useState(false)
  const [mailSendError, setMailSendError] = useState<string | null>(null)
  const contactsRef = useRef<OperisContact[] | null>(null)
  const [suggestedTenderContacts, setSuggestedTenderContacts] = useState<OperisContact[]>([])
  const [exportingPdf, setExportingPdf] = useState(false)
  const [showFolderPathModal, setShowFolderPathModal] = useState(false)
  const [savingFolderPath, setSavingFolderPath] = useState(false)
  const [folderPathInput, setFolderPathInput] = useState('')
  const [retainingQuote, setRetainingQuote] = useState<string | null>(null)
  const [linkedEmails, setLinkedEmails] = useState<any[]>([])
  const [tenderDocuments, setTenderDocuments] = useState<{
    received: any[]
    sent: any[]
    imported: any[]
    optional_png: any[]
    document_groups: any[]
  }>({ received: [], sent: [], imported: [], optional_png: [], document_groups: [] })
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [mailsLoading, setMailsLoading] = useState(false)
  const [documentsLoaded, setDocumentsLoaded] = useState(false)
  const [mailsLoaded, setMailsLoaded] = useState(false)
  const loadedTabsRef = useRef(new Set<string>())
  const [showLinkEmailModal, setShowLinkEmailModal] = useState(false)
  const [unlinkedEmails, setUnlinkedEmails] = useState<any[]>([])
  const [linkingEmail, setLinkingEmail] = useState(false)
  const [org, setOrg] = useState<OrganizationPayload | null>(null)
  const [assigningMember, setAssigningMember] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)

  // Form édition AO
  const [editForm, setEditForm] = useState({
    title: '', client: '', description: '', deadline: '',
    budget_ht: '', zone_geo: '', maitre_ouvrage: '',
    notes_internes: '', priorite: 'normale', status: 'nouveau',
  })

  const loadTender = useCallback(async (silent = false) => {
    if (!id) {
      if (!silent) {
        setLoadError('Identifiant AO manquant')
        setLoading(false)
      }
      return
    }
    const cacheKey = currentUserId ? cacheKeyForUser(currentUserId, `tender:${id}`) : null
    if (silent) setRefreshing(true)
    else if (!cacheKey || !readCache(cacheKey, 15 * 60_000)) setLoading(true)
    try {
      const res = await authFetch(`/api/tenders/${id}`, { timeoutMs: 20_000 })
      const data = await res.json()
      if (data.success) {
        setLoadError(null)
        setTender(data.data)
        if (cacheKey) writeCache(cacheKey, data.data)
        setEditForm({
          title: data.data.title ?? '',
          client: data.data.client ?? '',
          description: data.data.description ?? '',
          deadline: data.data.deadline ? String(data.data.deadline).slice(0, 10) : '',
          budget_ht: data.data.budget_ht ? String(data.data.budget_ht) : '',
          zone_geo: data.data.zone_geo ?? '',
          maitre_ouvrage: data.data.maitre_ouvrage ?? '',
          notes_internes: data.data.notes_internes ?? '',
          priorite: data.data.priorite ?? 'normale',
          status: data.data.status ?? 'nouveau',
        })
      } else if (!silent) {
        setLoadError(data.error ?? 'AO introuvable')
        showRef.current(`Erreur : ${data.error}`)
      }
    } catch (err) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : 'Impossible de charger cet AO'
        setLoadError(msg.includes('Timeout') ? 'Chargement trop long — réessayez' : msg)
      }
    }
    if (silent) setRefreshing(false)
    else setLoading(false)
  }, [id, currentUserId])

  const refreshTender = useCallback(() => loadTender(true), [loadTender])

  const closeEditModal = useCallback(() => {
    setShowEdit(false)
    setIsNewAoSetup(false)
  }, [])

  useEffect(() => {
    if (!tender || loading || setupOpenedRef.current) return
    if (!isTenderSetupQuery(searchParams)) return
    setupOpenedRef.current = true
    setIsNewAoSetup(true)
    setShowEdit(true)
    router.replace(`/tenders/${id}`, { scroll: false })
  }, [tender, loading, searchParams, id, router])

  useEffect(() => {
    authFetch('/api/organization')
      .then(r => r.json())
      .then(data => { if (data.success) setOrg(data.data ?? null) })
      .catch(() => {})
  }, [])

  const loadLinkedEmails = useCallback(async () => {
    try {
      const res = await authFetch(`/api/mail/emails?tender_id=${id}&limit=50`)
      const data = await res.json()
      if (data.success) setLinkedEmails(data.data ?? [])
    } catch { /* ignore */ }
    finally { setMailsLoaded(true) }
  }, [id])

  const loadDocuments = useCallback(async () => {
    if (!id) return
    setDocumentsLoading(true)
    try {
      const res = await authFetch(`/api/tenders/${id}/documents`, { timeoutMs: 120_000 })
      const data = await res.json()
      if (data.success) {
        setTenderDocuments(data.data ?? { received: [], sent: [], optional_png: [], document_groups: [] })
        setDocumentsLoaded(true)
      }
    } catch {
      showRef.current('Erreur chargement documents')
    } finally {
      setDocumentsLoading(false)
    }
  }, [id])

  const openLinkEmailModal = async () => {
    setShowLinkEmailModal(true)
    try {
      const res = await authFetch('/api/mail/emails?unlinked=true&limit=50')
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
        await refreshTender()
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
        await refreshTender()
        showRef.current('Email délié')
      } else showRef.current(`Erreur : ${data.error}`)
    } catch {
      showRef.current('Erreur déliaison')
    }
  }

  useEffect(() => {
    loadedTabsRef.current.clear()
    setTenderDocuments({ received: [], sent: [], imported: [], optional_png: [], document_groups: [] })
    setLinkedEmails([])
    setDocumentsLoaded(false)
    setMailsLoaded(false)
    setDocumentsLoading(false)
    setMailsLoading(false)
  }, [id])

  useEffect(() => {
    if (!id || !userId || !tender) return
    if (activeTab === 'mails' && !loadedTabsRef.current.has('mails')) {
      loadedTabsRef.current.add('mails')
      setMailsLoading(true)
      void loadLinkedEmails().finally(() => setMailsLoading(false))
    }
    // Chargé dès que le tender est prêt (pas seulement au clic sur l'onglet) : le badge
    // de comptage documents doit refléter le vrai total dès le premier affichage.
    if (!loadedTabsRef.current.has('documents')) {
      loadedTabsRef.current.add('documents')
      void loadDocuments()
    }
  }, [activeTab, id, userId, tender, loadLinkedEmails, loadDocuments])

  const openMailViewer = async (emailId: string) => {
    setMailViewerOpen(true)
    setMailViewerLoading(true)
    setMailViewerEmail(null)
    try {
      const res = await authFetch(`/api/mail/emails/${emailId}`)
      const data = await res.json()
      if (data.success) setMailViewerEmail(data.data as Email)
      else showRef.current('Email introuvable')
    } catch {
      showRef.current('Erreur chargement mail')
    }
    setMailViewerLoading(false)
  }

  const guessTenderMailRecipient = () => {
    const inbound = linkedEmails.find((e: { mail_folder?: string }) => e.mail_folder !== 'sent')
    return inbound?.from_address ?? ''
  }

  const loadContactsForTender = useCallback(async () => {
    if (contactsRef.current?.length) return
    try {
      const res = await authFetch('/api/contacts')
      const data = await res.json()
      if (data.success) contactsRef.current = data.data ?? []
    } catch { /* ignore */ }
  }, [])

  const openTenderMailCompose = async () => {
    await loadContactsForTender()
    const all = contactsRef.current ?? []
    const linked = all.filter(c => c.ao_ids?.includes(id))
    const primary = pickPrimaryTenderContact(all, id)
    const recipient = primary
      ? formatContactAddress(primary)
      : guessTenderMailRecipient()
    setSuggestedTenderContacts(
      primary ? linked.filter(c => c.id !== primary.id) : linked,
    )
    const subjectPrefix = tender?.title ? `Re: ${tender.title}` : ''
    setMailCompose({ to: recipient, cc: '', bcc: '', subject: subjectPrefix, body: '' })
    setMailAttachments([])
    setMailSendError(null)
    setMailComposing(true)
  }

  const handleTenderMailSend = async () => {
    const sig = getSignatureData()
    const signatureHtml = sig.html.trim()
    const bodyForSend = appendSignatureToBody(
      stripSignatureFromBody(mailCompose.body, sig.text),
      signatureHtml,
      sig.text,
    )
    if (!mailCompose.to || !mailCompose.subject) {
      setMailSendError('Destinataire et sujet requis')
      return
    }
    if (!bodyForSend.trim()) {
      setMailSendError('Message ou signature requis')
      return
    }
    setMailSending(true)
    setMailSendError(null)
    try {
      const attachmentPayload = await Promise.all(
        mailAttachments.map(async f => ({
          filename: f.name,
          contentType: f.type || 'application/octet-stream',
          data: await fileToBase64(f),
        })),
      )
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: mailCompose.to,
          cc: mailCompose.cc || undefined,
          bcc: mailCompose.bcc || undefined,
          subject: mailCompose.subject,
          body: bodyForSend,
          tenderId: id,
          attachments: attachmentPayload.length > 0 ? attachmentPayload : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMailComposing(false)
        await loadLinkedEmails()
        await refreshTender()
        showRef.current('Email envoyé')
      } else {
        setMailSendError(data.error ?? 'Erreur envoi')
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      setMailSendError(err.message ?? 'Erreur envoi')
    }
    setMailSending(false)
  }

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
    if (!showAddSupplierModal) return
    void loadAllSuppliers()
  }, [showAddSupplierModal, loadAllSuppliers])

  useEffect(() => {
    if (!id) return
    if (!userId) {
      if (ready) {
        setLoading(false)
        setLoadError('Session expirée — reconnectez-vous')
      }
      return
    }
    const cacheKey = cacheKeyForUser(userId, `tender:${id}`)
    const cached = readCache<any>(cacheKey, 15 * 60_000)
    if (cached) {
      setTender(cached)
      setLoading(false)
    } else {
      setTender(null)
      setLoadError(null)
      setLoading(true)
    }
    loadTender(Boolean(cached))
  }, [id, userId, ready, loadTender])

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
        closeEditModal()
        show(isNewAoSetup ? 'AO configuré ✓' : 'AO mis à jour ✓')
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
          body: JSON.stringify({ filename: f.name, contentType: f.type, data, source: 'manual_import' }),
        })
        const json = await res.json()
        if (!json.success) show(`Erreur : ${json.error}`)
      }
      show('Document(s) ajouté(s)')
      await refreshTender()
      if (documentsLoaded) await loadDocuments()
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setUploadingDoc(false)
  }

  const handleMailAttachmentAction = async (
    action: 'include' | 'exclude',
    emailId: string,
    attachmentIndex: number,
  ) => {
    const actionKey = `${action}:${emailId}:${attachmentIndex}`
    setPngAttachmentAction(actionKey)
    try {
      const res = await authFetch(`/api/tenders/${id}/documents/mail-attachment`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          email_id: emailId,
          attachment_index: attachmentIndex,
        }),
      })
      const data = await res.json()
      if (data.success) {
        show(action === 'include' ? 'Image intégrée à l\'AO' : 'Image ignorée pour cet AO')
        await refreshTender()
        if (documentsLoaded) await loadDocuments()
      } else show(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      show(`Erreur : ${err.message ?? 'réseau'}`)
    }
    setPngAttachmentAction(null)
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
        const pendingCount = data.data.pendingVerification ?? 0
        const parts = [
          data.data.sent > 0 ? `${data.data.sent} envoyée(s)` : null,
          pendingCount > 0 ? `${pendingCount} en attente de vérification (1er contact)` : null,
          errCount > 0 ? `${errCount} erreur(s)` : null,
        ].filter(Boolean)
        show(parts.join(', ') || 'Aucune consultation envoyée')
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

  // Trace un contact fait hors Operis (téléphone, en personne…) — aucun email
  // envoyé, juste le statut mis à jour. Disponible que la messagerie soit
  // connectée ou non.
  const handleMarkManual = async (supplierId: string, action: 'sent' | 'relance') => {
    const res = await authFetch(`/api/tenders/${id}/consult/manual`, {
      method: 'POST',
      body: JSON.stringify({ supplier_id: supplierId, action }),
    })
    const data = await res.json()
    if (data.success) { show(action === 'sent' ? 'Marqué comme envoyé' : 'Marqué comme relancé'); await refreshTender() }
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

  const handleOpenFolder = async () => {
    const link = tender?.dossier_url?.trim()
    if (!link) {
      setShowFolderPathModal(true)
      return
    }

    if (isHttpsDossierUrl(link)) {
      window.open(link, '_blank', 'noopener,noreferrer')
      return
    }

    // Chemin local / partage réseau (UNC) : file:// et \\serveur sont bloqués depuis une
    // page https. Sur le desktop Electron, on peut l'ouvrir directement ; sinon on copie
    // le chemin dans le presse-papier pour que l'utilisateur le colle dans l'Explorateur.
    if (isElectronDesktop()) {
      const result = await window.operisDesktop?.openFolder(link)
      if (!result?.success) show(`Erreur : ${result?.error ?? 'dossier introuvable'}`)
      return
    }

    try {
      await navigator.clipboard.writeText(link)
      show('Chemin copié, collez-le dans l\'explorateur de fichiers')
    } catch {
      show(`Impossible de copier automatiquement — chemin : ${link}`)
    }
  }

  const handleSaveFolderPath = async (path: string) => {
    setSavingFolderPath(true)
    try {
      const res = await authFetch(`/api/tenders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ dossier_url: path.trim() || null }),
      })
      const data = await res.json()
      if (data.success) {
        setShowFolderPathModal(false)
        await refreshTender()
      } else show(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      show(`Erreur : ${err.message ?? 'réseau'}`)
    }
    setSavingFolderPath(false)
  }

  const handleBrowseFolder = async () => {
    if (!window.operisDesktop?.selectFolder) {
      show('Fonction indisponible — mettez à jour l\'application desktop Operis')
      return
    }
    try {
      const result = await window.operisDesktop.selectFolder()
      if (result && !result.canceled && result.path) {
        setFolderPathInput(result.path)
      }
    } catch {
      show('Erreur lors de l\'ouverture du sélecteur de dossier')
    }
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

  const fetchDocumentAccess = async (docId: string, inline: boolean) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Non authentifié')
    const query = inline ? 'inline=true' : 'mode=download'
    const res = await fetch(
      `/api/tenders/${id}/documents/${encodeURIComponent(docId)}/url?${query}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Fichier indisponible')
    return data.data as { url?: string; stream?: boolean; path?: string }
  }

  const streamTenderDocument = async (docId: string, disposition: 'inline' | 'attachment') => {
    const token = await getAccessToken()
    if (!token) throw new Error('Non authentifié')
    const res = await fetch(
      `/api/tenders/${id}/documents/${encodeURIComponent(docId)}?disposition=${disposition}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) throw new Error('Fichier indisponible')
    return res.blob()
  }

  const navigatePreviewTab = (win: Window | null, href: string) => {
    if (win && !win.closed) {
      win.location.href = href
      return
    }
    const a = document.createElement('a')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const openTenderDocument = async (docId: string, filename: string, _contentType?: string) => {
    const win = window.open('', '_blank')
    try {
      const meta = await fetchDocumentAccess(docId, true)
      if (meta.url) {
        navigatePreviewTab(win, meta.url)
        return
      }
      const blob = await streamTenderDocument(docId, 'inline')
      const blobUrl = URL.createObjectURL(blob)
      navigatePreviewTab(win, blobUrl)
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch (e) {
      console.error('[PJ Voir] échec', e)
      if (win && !win.closed) win.close()
      show('Erreur ouverture')
    }
  }

  const downloadTenderDocument = async (docId: string, filename: string, _contentType?: string) => {
    try {
      const meta = await fetchDocumentAccess(docId, false)
      if (meta.url) {
        const a = document.createElement('a')
        a.href = meta.url
        a.download = filename
        a.rel = 'noopener'
        a.click()
        return
      }
      const blob = await streamTenderDocument(docId, 'attachment')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      show('Erreur téléchargement')
    }
  }

  const handleAssignMember = async (memberId: string) => {
    setAssigningMember(true)
    try {
      const res = await authFetch('/api/organization', {
        method: 'PUT',
        body: JSON.stringify({
          action: 'assign',
          tender_id: id,
          assigned_to: memberId || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        show(memberId ? 'Membre assigne sur cet AO' : 'Assignation retiree')
        setShowAssignModal(false)
        await refreshTender()
      } else show(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      show(`Erreur : ${err.message ?? 'réseau'}`)
    }
    setAssigningMember(false)
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer cet AO définitivement ?')) return
    const res = await authFetch(`/api/tenders/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) { show('AO supprimé'); router.push('/tenders') }
    else show(`Erreur : ${data.error}`)
  }

  if (loading && !tender) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>
  if (!tender) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>{loadError ?? 'AO introuvable'}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {userId && (
            <Button variant="primary" onClick={() => void loadTender(false)}>Réessayer</Button>
          )}
          <Button variant="ghost" onClick={() => router.push('/tenders')}>← Retour aux AO</Button>
        </div>
      </div>
    )
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }
  const label: React.CSSProperties = { fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }
  const value: React.CSSProperties = { fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }

  const consultations = tender.consultations ?? []
  const quotes = tender.quotes ?? []
  const documents = tenderDocuments
  const receivedDocs = documents.received ?? []
  const sentDocs = documents.sent ?? []
  const importedDocs = documents.imported ?? []
  const optionalPngDocs = documents.optional_png ?? []
  const documentGroups = documents.document_groups ?? []
  const tenderMeta = tender.meta as { document_count?: number; linked_email_count?: number } | undefined
  const documentsTabCount = documentsLoaded
    ? receivedDocs.length + sentDocs.length + importedDocs.length
    : (tenderMeta?.document_count ?? 0)
  const mailsTabCount = mailsLoaded
    ? linkedEmails.length
    : (tenderMeta?.linked_email_count ?? 0)
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
              {tender.is_own_client && (
                <span style={{
                  fontSize: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid rgba(79,142,247,0.3)',
                  borderRadius: 6, padding: '3px 9px', fontWeight: 600,
                }}>
                  Vous êtes le client
                </span>
              )}
              {prioriteOpt && tender.priorite !== 'normale' && (
                <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: prioriteOpt.color, background: `${prioriteOpt.color}20`, border: `1px solid ${prioriteOpt.color}40`, borderRadius: 6, padding: '3px 9px', fontWeight: 600 }}>{prioriteOpt.label}</span>
              )}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6 }}>{tender.client}</div>
            {(() => {
              const creatorLabel = tender.creator_label ?? getTenderCreatorLabel(tender, currentUserId, org)
              const assigneeLabel = tender.assignee_label ?? getTenderAssigneeLabel(tender, currentUserId, org)
              if (!creatorLabel && !assigneeLabel) return null
              return (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {creatorLabel && (
                    <TenderOriginBadge label={creatorLabel} type="creator" />
                  )}
                  {assigneeLabel && (
                    <TenderOriginBadge label={assigneeLabel} type="assigned" />
                  )}
                </div>
              )
            })()}
            {tender.access?.can_assign && org?.members && org.members.length > 1 && (
              <div style={{ marginTop: 12 }}>
                <Button variant="ghost" onClick={() => setShowAssignModal(true)}>
                  👤 {tender.assigned_to ? 'Réassigner' : 'Assigner'}
                </Button>
              </div>
            )}
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
            <span style={{ display: 'inline-flex', gap: 2 }}>
              <span title={
                !tender.dossier_url
                  ? 'Aucun lien configuré — cliquez pour le renseigner'
                  : isHttpsDossierUrl(tender.dossier_url)
                    ? `Ouvrir dans un nouvel onglet : ${tender.dossier_url}`
                    : isElectronDesktop()
                      ? `Ouvrir : ${tender.dossier_url}`
                      : `Copier le chemin : ${tender.dossier_url}`
              }>
                <Button variant="ghost" onClick={handleOpenFolder}>
                  {tender.dossier_url ? '📂 Lien dossier' : '📂 Créer le lien'}
                </Button>
              </span>
              {tender.dossier_url && (
                <span title="Modifier le lien du dossier">
                  <Button variant="ghost" onClick={() => setShowFolderPathModal(true)}>⚙️</Button>
                </span>
              )}
            </span>
            <Button variant="ghost" onClick={handleExportPdf} loading={exportingPdf}>Exporter PDF</Button>
            <Button variant="ghost" onClick={() => refreshTender()} disabled={refreshing}>Actualiser</Button>
            <Button variant="ghost" onClick={() => setShowEdit(true)}>Modifier</Button>
            {tender.access?.can_delete && (
              <Button variant="danger" onClick={handleDelete}>Supprimer</Button>
            )}
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
          <span style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
            border: '1px dashed var(--border-hi)', borderRadius: 8, padding: '8px 14px',
          }}>
            Bientôt disponible
          </span>
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
          { id: 'documents' as const, label: 'Documents', count: documentsTabCount },
          { id: 'mails' as const, label: 'Mails', count: mailsTabCount },
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
        <Modal open={showLinkEmailModal} onClose={() => setShowLinkEmailModal(false)} title="Lier un email à cet AO" size="lg">
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
                  animationDelay: `${i * 50}ms`,
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
                          <>
                            <Button variant="ghost" onClick={() => openConsultModal([c.supplier_id])} style={{ fontSize: 11, padding: '4px 10px' }}>Envoyer</Button>
                            <span title="Contacté hors Operis (téléphone, etc.) — aucun email envoyé">
                              <Button variant="ghost" onClick={() => handleMarkManual(c.supplier_id, 'sent')} style={{ fontSize: 11, padding: '4px 10px' }}>Marquer envoyé</Button>
                            </span>
                          </>
                        )}
                        {['envoye', 'relance', 'relance_2'].includes(c.status) && (
                          <>
                            <Button variant="ghost" onClick={() => handleRelaunch(c.supplier_id)} style={{ fontSize: 11, padding: '4px 10px' }}>Relancer</Button>
                            <span title="Contacté hors Operis (téléphone, etc.) — aucun email envoyé">
                              <Button variant="ghost" onClick={() => handleMarkManual(c.supplier_id, 'relance')} style={{ fontSize: 11, padding: '4px 10px' }}>Marquer relancé</Button>
                            </span>
                          </>
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

      {activeTab === 'mails' && (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Fils de conversation ({mailsLoading ? '…' : groupEmailsByThread(linkedEmails as Email[]).length})
          </div>
          <Button variant="ghost" onClick={openTenderMailCompose}>✉️ Envoyer un mail</Button>
        </div>
        {mailsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
        ) : linkedEmails.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
            Aucun mail lié — liez un email ou envoyez un message depuis cet AO
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {groupEmailsByThread(linkedEmails as Email[]).map(thread => {
              const threadStatus = computeThreadStatus(thread.emails, 5)
              const statusMeta = THREAD_STATUS_META[threadStatus]
              return (
                <div
                  key={thread.threadId}
                  style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}
                >
                  <div style={{
                    padding: '12px 16px', background: 'rgba(2,18,70,0.06)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#021246' }}>
                      {statusMeta.emoji} FIL — {thread.title}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 12,
                      background: `${statusMeta.color}18`, color: statusMeta.color,
                      border: `1px solid ${statusMeta.color}40`,
                    }}>
                      {statusMeta.label}
                    </span>
                  </div>
                  {thread.emails.map((em: Email & { attachments?: Array<{ filename: string }> }, idx: number) => {
                    const isSent = em.mail_folder === 'sent'
                    const party = isSent ? em.to_address : em.from_address
                    const attCount = em.has_attachments
                      ? (Array.isArray(em.attachments) ? em.attachments.length : 1)
                      : 0
                    const cat = em.ao_detection_category as AoKeywordCategory | undefined
                    const catBadge = cat && AO_CATEGORY_BADGE[cat]
                    return (
                      <div
                        key={em.id}
                        style={{
                          padding: '14px 16px', background: 'var(--bg-secondary)',
                          borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#021246' }}>
                            {isSent ? '📤' : '📥'}
                            {em.received_at ? new Date(em.received_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{party ?? '—'}</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                          {em.subject || '(sans objet)'}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                          {(em.is_ao_related || em.is_ao) && (
                            <span style={{
                              fontSize: 9, padding: '2px 8px', borderRadius: 4,
                              background: 'rgba(59,127,246,0.12)', color: '#3B7FE8',
                              border: '1px solid rgba(59,127,246,0.25)',
                            }}>
                              🏷️ Détecté : AO
                              {em.ao_detection_score ? ` [Score: ${em.ao_detection_score}]` : ''}
                            </span>
                          )}
                          {catBadge && cat !== 'detection' && (
                            <span style={{
                              fontSize: 9, padding: '2px 8px', borderRadius: 4,
                              background: `${catBadge.color}18`, color: catBadge.color,
                            }}>
                              {catBadge.emoji} {catBadge.label}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => openMailViewer(em.id)}
                            style={{
                              fontSize: 11, color: '#021246', background: 'rgba(2,18,70,0.08)',
                              border: '1px solid rgba(2,18,70,0.2)', borderRadius: 6, padding: '4px 12px',
                              cursor: 'pointer', fontWeight: 600,
                            }}
                          >
                            Voir
                          </button>
                          {attCount > 0 && (
                            <button
                              type="button"
                              onClick={() => openMailViewer(em.id)}
                              style={{
                                fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)',
                                border: '1px solid rgba(59,126,246,0.2)', borderRadius: 6, padding: '4px 10px',
                                cursor: 'pointer',
                              }}
                            >
                              📎 {em.attachments?.[0]?.filename ?? `${attCount} PJ`}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
      )}

      {activeTab === 'documents' && (
      <div style={card}>
        {documentsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : (
        <>
        <input type="file" multiple style={{ display: 'none' }} id="tender-doc-upload"
          onChange={e => { if (e.target.files?.length) handleUploadTenderDoc(e.target.files); e.target.value = '' }} />
        <TenderDocumentsTab
          receivedDocs={receivedDocs}
          sentDocs={sentDocs}
          importedDocs={importedDocs}
          optionalPngDocs={optionalPngDocs}
          documentGroups={documentGroups}
          uploadingDoc={uploadingDoc}
          showOptionalPng={showOptionalPng}
          pngAttachmentAction={pngAttachmentAction}
          onUploadClick={() => document.getElementById('tender-doc-upload')?.click()}
          onOpen={openTenderDocument}
          onDownload={downloadTenderDocument}
          onOpenMail={openMailViewer}
          onExcludePng={(emailId, idx) => handleMailAttachmentAction('exclude', emailId, idx)}
          onIncludePng={(emailId, idx) => handleMailAttachmentAction('include', emailId, idx)}
          onToggleOptionalPng={() => setShowOptionalPng(v => !v)}
        />
        </>
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
      <Modal open={showEdit} onClose={closeEditModal} title={isNewAoSetup ? "Configurer l'appel d'offres" : "Modifier l'appel d'offres"} size="xl">
        <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
          {isNewAoSetup && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
              Vérifiez la deadline, le budget et les informations clés avant de commencer sur cet AO.
            </p>
          )}
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
          <Button variant="ghost" onClick={closeEditModal}>Annuler</Button>
          <Button variant="primary" loading={savingEdit} onClick={handleSaveEdit}>
            {isNewAoSetup ? 'Enregistrer et continuer' : 'Sauvegarder'}
          </Button>
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
          language: c.supplier?.language ?? null,
        }))}
        preselectIds={consultPreselect}
        sending={sendingConsult}
        onSend={handleSendConsult}
      />

      {/* === MODAL ASSIGNER À UN MEMBRE DE LA FAMILLE === */}
      <Modal open={showAssignModal} onClose={() => setShowAssignModal(false)} title="Assigner cet AO">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(org?.members ?? [])
            .filter(m => m.user_id !== org?.owner_id)
            .map(m => {
              const initials = (memberDisplayName(m) || '?').slice(0, 2).toUpperCase()
              const isCurrent = tender?.assigned_to === m.user_id
              return (
                <button
                  key={m.user_id}
                  type="button"
                  disabled={assigningMember}
                  onClick={() => handleAssignMember(m.user_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                    padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                    border: isCurrent ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: isCurrent ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                    cursor: assigningMember ? 'wait' : 'pointer',
                  }}
                >
                  <span style={{
                    width: 36, height: 36, borderRadius: 10, background: m.color ?? '#021246',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {initials}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {memberDisplayName(m)}
                  </span>
                  {isCurrent && (
                    <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'DM Mono, monospace' }}>
                      Assigné
                    </span>
                  )}
                </button>
              )
            })}
          {tender?.assigned_to && (
            <button
              type="button"
              disabled={assigningMember}
              onClick={() => handleAssignMember('')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
                padding: '10px 14px', borderRadius: 10, textAlign: 'center', marginTop: 4,
                border: '1px dashed var(--border-hi)', background: 'transparent',
                color: 'var(--text-muted)', cursor: assigningMember ? 'wait' : 'pointer', fontSize: 12,
              }}
            >
              Retirer l&apos;assignation
            </button>
          )}
        </div>
      </Modal>

      {/* === MODAL LIEN DOSSIER (local/UNC ou cloud) === */}
      <Modal
        open={showFolderPathModal}
        onClose={() => setShowFolderPathModal(false)}
        title="Lien dossier du chantier"
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Chemin local/réseau (ex: <code>C:\Chantiers\{tender?.title}</code> ou{' '}
            <code>\\NAS\Chantiers\...</code>) ou lien cloud (<code>https://...</code>).
            Un lien https s&apos;ouvre dans un nouvel onglet ; un chemin local/réseau est copié
            dans le presse-papier pour être collé dans l&apos;Explorateur (sauf sur l&apos;app
            desktop, qui l&apos;ouvre directement).
          </div>
          <Field
            label="Lien ou chemin du dossier"
            value={folderPathInput || tender?.dossier_url || ''}
            onChange={setFolderPathInput}
            placeholder="C:\Chantiers\Nom du chantier ou https://..."
          />
          {isElectronDesktop() && (
            <Button variant="ghost" onClick={() => void handleBrowseFolder()} style={{ marginTop: 8 }}>
              📁 Parcourir…
            </Button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setShowFolderPathModal(false)}>Annuler</Button>
          <Button
            variant="primary"
            loading={savingFolderPath}
            onClick={() => handleSaveFolderPath(folderPathInput || tender?.dossier_url || '')}
          >
            Enregistrer
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

      <Modal
        open={mailViewerOpen}
        onClose={() => { setMailViewerOpen(false); setMailViewerEmail(null) }}
        title={mailViewerEmail?.subject ?? 'Mail'}
        size="lg"
      >
        {mailViewerLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner size={24} /></div>
        ) : mailViewerEmail ? (
          <div>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginBottom: 8 }}>
              {mailViewerEmail.mail_folder === 'sent' ? `À : ${mailViewerEmail.to_address}` : `De : ${mailViewerEmail.from_address}`}
              {' · '}
              {mailViewerEmail.received_at ? new Date(mailViewerEmail.received_at).toLocaleString('fr-FR') : ''}
            </div>
            <div style={{
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
              maxHeight: 480, overflowY: 'auto', whiteSpace: 'pre-wrap',
              padding: '12px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)',
            }}>
              {mailViewerEmail.body_html
                ? <div dangerouslySetInnerHTML={{ __html: mailViewerEmail.body_html }} />
                : (mailViewerEmail.body_text ?? '—')}
            </div>
            {mailViewerEmail.has_attachments && (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
                }}>
                  Pièces jointes
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {normalizeAttachments(mailViewerEmail.attachments).map((att, index) => {
                    const docId = `mail:${mailViewerEmail.id}:${index}`
                    return (
                      <div
                        key={docId}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
                          background: 'var(--bg-secondary)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📎 {att.filename}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
                            {att.size ? `${Math.round(att.size / 1024)} Ko` : '—'}
                          </div>
                        </div>
                        <DocumentFileActions
                          onOpen={() => openTenderDocument(docId, att.filename, att.contentType)}
                          onDownload={() => downloadTenderDocument(docId, att.filename, att.contentType)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email introuvable</div>
        )}
      </Modal>

      {mailComposing && (
        <MailComposePopup
          compose={mailCompose}
          onChange={patch => setMailCompose(c => ({ ...c, ...patch }))}
          onSend={() => void handleTenderMailSend()}
          onRequestClose={() => setMailComposing(false)}
          onClosedByUser={() => setMailComposing(false)}
          onDelete={() => setMailComposing(false)}
          attachments={mailAttachments}
          onRemoveAttachment={i => setMailAttachments(prev => prev.filter((_, j) => j !== i))}
          onAddAttachments={files => setMailAttachments(prev => [...prev, ...files])}
          sending={mailSending}
          sendError={mailSendError}
          draftSavedLabel={null}
          isListening={false}
          onToggleSpeech={() => {}}
          signaturePreview={getSignatureData()}
          contactsRef={contactsRef}
          tenderId={id}
          suggestedTenderContacts={suggestedTenderContacts}
        />
      )}
    </div>
  )
}
