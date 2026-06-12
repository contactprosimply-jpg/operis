'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authFetch, getAccessToken } from '@/lib/auth-client'
import { useAuth } from '@/components/AuthProvider'
import { Email, EmailAttachment, EmailLabel, EmailPriority } from '@/types/database'
import { PRESET_EMAIL_LABELS } from '@/lib/mail-api'
import { Spinner } from '@/components/ui'
import { getSignatureData, stripSignatureFromBody } from '@/lib/email-signature'
import { groupEmailsByDate } from '@/lib/mail-grouping'
import MailFolderSidebar from '@/components/mail/MailFolderSidebar'
import MailComposePopup from '@/components/mail/MailComposePopup'
import MailToolbar from '@/components/mail/MailToolbar'
import { MailListSkeleton, MailBodySkeleton } from '@/components/mail/MailSkeletons'
import {
  type MailFolderSelection,
  type CachedImapFolder,
  folderSelectionKey,
  FOLDER_LABELS,
} from '@/lib/mail-folders'
import {
  loadDrafts,
  upsertDraft,
  removeDraft,
  newDraftId,
  htmlToPlainText,
  type MailDraft,
} from '@/lib/mail-drafts'

const MAIL_LIST_PAGE_SIZE = 30

type EmailWithQuote = Email & {
  quote_analysis?: {
    price_ht: number | null
    tender_id: string | null
    enriched: boolean
    supplier_missing?: boolean
  }
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: { [index: number]: { transcript: string } } }
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: (e: SpeechRecognitionEventLike) => void
  onend: () => void
  onerror: () => void
  start: () => void
  stop: () => void
}

type MailFilter = 'all' | 'unread' | 'ao' | 'attachments'

const PRIORITY_STYLES: Record<EmailPriority, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  normal: { label: 'Normal', color: 'var(--text-muted)', bg: 'transparent' },
  info: { label: 'Info', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
}

function formatMailTime(dateStr: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= startOfToday) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function SignaturePreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { margin: 0; padding: 16px 20px; background: #fff; }
      img { max-width: 100%; height: auto; }
      table { max-width: 100%; }
    </style></head><body>${html}</body></html>`)
    doc.close()
    const resize = () => {
      const h = doc.documentElement.scrollHeight || doc.body.scrollHeight
      iframe.style.height = `${Math.max(100, h + 8)}px`
    }
    resize()
    const t = setTimeout(resize, 150)
    return () => clearTimeout(t)
  }, [html])

  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace',
      }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span>Signature</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div style={{
        background: '#fff', borderRadius: 10, border: '1px solid var(--border-hi)',
        overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
      }}>
        <iframe ref={iframeRef} title="Aperçu signature" style={{ width: '100%', border: 'none', display: 'block', minHeight: 100 }} />
      </div>
    </div>
  )
}

export default function MailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pendingEmailId = searchParams.get('email')
  const { session, ready } = useAuth()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listHasMore, setListHasMore] = useState(false)
  const [loadingDetailBody, setLoadingDetailBody] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [autoSyncStatus, setAutoSyncStatus] = useState<string | null>(null)
  const [selected, setSelected] = useState<Email | null>(null)
  const [composing, setComposing] = useState(false)
  const [composeMinimized, setComposeMinimized] = useState(false)
  const [draftSavedLabel, setDraftSavedLabel] = useState<string | null>(null)
  const [compose, setCompose] = useState({ to: '', cc: '', bcc: '', subject: '', body: '' })
  const [attachments, setAttachments] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [creatingAoId, setCreatingAoId] = useState<string | null>(null)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [tendersForLink, setTendersForLink] = useState<Array<{ id: string; title: string; client: string }>>([])
  const [linkingTender, setLinkingTender] = useState(false)
  const [folderSelection, setFolderSelection] = useState<MailFolderSelection>({ kind: 'inbox' })
  const folder = folderSelection.kind
  const [customFolders, setCustomFolders] = useState<CachedImapFolder[]>([])
  const [mailAccounts, setMailAccounts] = useState<Array<{ id: string; email: string }>>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [serverDraftId, setServerDraftId] = useState<string | null>(null)
  const [listListFilter, setListListFilter] = useState<'all' | 'unread' | 'attachments'>('all')
  const [allEmails, setAllEmails] = useState<Email[]>([])
  const [drafts, setDrafts] = useState<MailDraft[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [folderActionLoading, setFolderActionLoading] = useState(false)
  const [mailAccountEmail, setMailAccountEmail] = useState<string | null>(null)
  const [inboxUnread, setInboxUnread] = useState(0)
  const [filter, setFilter] = useState<MailFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<EmailPriority | ''>('')
  const [fromFilter, setFromFilter] = useState('')
  const [tenderFilter, setTenderFilter] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [sinceFilter, setSinceFilter] = useState('')
  const [untilFilter, setUntilFilter] = useState('')
  const [tendersForFilter, setTendersForFilter] = useState<Array<{ id: string; title: string; client: string }>>([])
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [contextMenuEmailId, setContextMenuEmailId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileShowDetail, setMobileShowDetail] = useState(false)
  const emailCountRef = useRef(0)
  const selectedIdRef = useRef<string | null>(null)
  const syncInProgressRef = useRef(false)
  const syncAbortRef = useRef<AbortController | null>(null)
  const initialSyncDoneRef = useRef(false)
  const emailsRef = useRef<Email[]>([])
  const mailCache = useRef<Record<string, EmailWithQuote>>({})
  const prefetchingRef = useRef<Set<string>>(new Set())
  const listScrollRef = useRef<HTMLDivElement>(null)
  const listHasMoreRef = useRef(false)
  const loadingMoreRef = useRef(false)
  selectedIdRef.current = selected?.id ?? null
  emailsRef.current = emails

  const userId = session?.user?.id

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  const toggleSpeech = () => {
    const w = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) { showToast('Reconnaissance vocale non supportée'); return }
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let transcript = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript
      }
      if (transcript.trim()) {
        setCompose(c => ({ ...c, body: c.body ? `${c.body} ${transcript}` : transcript }))
      }
    }
    rec.onend = () => setIsListening(false)
    rec.onerror = () => setIsListening(false)
    recognitionRef.current = rec
    rec.start()
    setIsListening(true)
  }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!contextMenuEmailId) return
    const close = () => setContextMenuEmailId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenuEmailId])

  const refreshFolders = useCallback(() => {
    authFetch('/api/mail/folders')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setCustomFolders(data.data?.customFolders ?? [])
          setMailAccounts(data.data?.accounts ?? [])
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!ready || !userId) return
    authFetch('/api/mail/accounts')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const acc = data.data?.primary ?? data.data?.accounts?.[0]
          setMailAccountEmail(acc?.smtp_user ?? acc?.imap_user ?? session?.user?.email ?? null)
        }
      })
      .catch(() => {})
    setDrafts(loadDrafts(userId))
    refreshFolders()
  }, [ready, userId, session?.user?.email, refreshFolders])

  const handleCreateFolder = useCallback(async (name: string, parentPath?: string) => {
    setFolderActionLoading(true)
    try {
      const res = await authFetch('/api/mail/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parentPath }),
      })
      const data = await res.json()
      if (data.success) {
        setCustomFolders(data.data?.customFolders ?? [])
        showToast(`Dossier « ${name} » créé`)
        return true
      }
      showToast(data.error ?? 'Erreur création dossier')
      return false
    } catch {
      showToast('Erreur création dossier')
      return false
    } finally {
      setFolderActionLoading(false)
    }
  }, [])

  const handleSelectionChange = (sel: MailFolderSelection) => {
    setFolderSelection(sel)
    setEmails([])
    setSelected(null)
    setComposing(false)
    if (isMobile) setMobileShowDetail(false)
    if (sel.kind === 'drafts' && userId) {
      setDrafts(loadDrafts(userId))
      authFetch('/api/mail/drafts').then(r => r.json()).then(d => {
        if (d.success && Array.isArray(d.data)) {
          /* server drafts merged in drafts folder UI later */
        }
      }).catch(() => {})
    }
    loadEmails(false, sel)
    if (sel.kind === 'sent' || sel.kind === 'inbox') void runSync(true)
  }

  const mailAction = async (action: string, payload: Record<string, unknown> = {}) => {
    const res = await authFetch('/api/mail/actions', {
      method: 'POST',
      body: JSON.stringify({ action, ...payload }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error ?? 'Erreur')
    return data
  }

  useEffect(() => {
    if (!ready || !userId) return
    authFetch('/api/tenders')
      .then(r => r.json())
      .then(data => {
        if (!data.success) return
        const list = (data.data ?? []).map((t: { id?: string; tender_id?: string; title: string; client: string }) => ({
          id: t.id ?? t.tender_id ?? '',
          title: t.title,
          client: t.client,
        })).filter((t: { id: string }) => t.id)
        setTendersForFilter(list)
      })
      .catch(() => {})
  }, [ready, userId])

  const fetchEmailDetail = useCallback(async (
    emailId: string,
    options?: { analyze?: boolean; silent?: boolean },
  ): Promise<EmailWithQuote | null> => {
    const analyze = options?.analyze ?? false
    const silent = options?.silent ?? false
    try {
      const res = await authFetch(`/api/mail/emails/${emailId}?analyze=${analyze}`)
      const data = await res.json()
      if (!data.success) return null
      const full = data.data as EmailWithQuote
      const merged: EmailWithQuote = {
        ...full,
        tender_id: full.tender_id ?? null,
        quote_analysis: full.quote_analysis ?? mailCache.current[emailId]?.quote_analysis,
      }
      mailCache.current[emailId] = { ...mailCache.current[emailId], ...merged }
      if (selectedIdRef.current === emailId) {
        setSelected(mailCache.current[emailId])
      }
      setEmails(prev => prev.map(e => e.id === full.id ? {
        ...e,
        has_attachments: full.has_attachments,
        attachments: full.attachments,
        tender_id: merged.tender_id ?? e.tender_id,
      } : e))
      if (!silent && analyze && full.quote_analysis?.price_ht) {
        showToast(`Prix détecté : ${Number(full.quote_analysis.price_ht).toLocaleString('fr-FR')} € HT`)
      } else if (!silent && analyze && full.quote_analysis?.supplier_missing) {
        showToast('Fournisseur non reconnu — vérifiez l\'email du fournisseur dans Operis')
      } else if (!silent && analyze && full.quote_analysis?.enriched) {
        showToast('Email et pièces jointes importés')
      } else if (!silent && analyze && full.has_attachments && !full.quote_analysis?.price_ht) {
        showToast('Prix non trouvé dans le PDF — saisie manuelle sur l\'AO')
      }
      return mailCache.current[emailId]
    } catch (e) {
      console.error(e)
      return null
    }
  }, [])

  const loadEmailDetail = useCallback(async (
    emailId: string,
    silent = false,
    options?: { analyzeOnly?: boolean },
  ) => {
    if (emailId.startsWith('elog-')) {
      const local = emailsRef.current.find(e => e.id === emailId)
      if (local) setSelected(local)
      return
    }
    const cached = mailCache.current[emailId]
    if (options?.analyzeOnly && cached) {
      void fetchEmailDetail(emailId, { analyze: true, silent: true })
      return
    }
    if (cached?.body_html || cached?.body_text) {
      setSelected(cached)
      if (!cached.quote_analysis) void fetchEmailDetail(emailId, { analyze: true, silent: true })
      return
    }
    setLoadingDetailBody(true)
    try {
      await fetchEmailDetail(emailId, { analyze: false, silent })
      void fetchEmailDetail(emailId, { analyze: true, silent: true })
    } finally {
      setLoadingDetailBody(false)
    }
  }, [fetchEmailDetail])

  const loadEmails = useCallback(async (
    silent = false,
    selectionOverride?: MailFolderSelection,
    append = false,
  ) => {
    if (append) {
      if (loadingMoreRef.current || !listHasMoreRef.current) return
      loadingMoreRef.current = true
      setLoadingMore(true)
    } else if (!silent) {
      setLoading(true)
    }
    const safetyTimer = setTimeout(() => {
      if (!silent && !append) setLoading(false)
      if (append) {
        setLoadingMore(false)
        loadingMoreRef.current = false
      }
    }, 12000)
    try {
      const activeSelection = selectionOverride ?? folderSelection
      const activeFolder = activeSelection.kind
      const offset = append ? emailsRef.current.length : 0
      const params = new URLSearchParams({
        limit: String(MAIL_LIST_PAGE_SIZE),
        offset: String(offset),
        folder: activeFolder,
      })
      if (activeSelection.kind === 'custom' && activeSelection.customPath) {
        params.set('imap_path', activeSelection.customPath)
      }
      if (searchQuery.trim()) params.set('q', searchQuery.trim())
      const listFilter = activeFolder === 'inbox' ? (listListFilter === 'all' ? filter : listListFilter) : 'all'
      if (listFilter === 'ao') params.set('ao', 'true')
      if (listFilter === 'unread') params.set('unread', 'true')
      if (listFilter === 'attachments') params.set('attachments', 'true')
      if (priorityFilter) params.set('priority', priorityFilter)
      if (fromFilter.trim()) params.set('from', fromFilter.trim())
      if (tenderFilter) params.set('tender_id', tenderFilter)
      if (labelFilter) params.set('label', labelFilter)
      if (sinceFilter) params.set('since', `${sinceFilter}T00:00:00.000Z`)
      if (untilFilter) params.set('until', `${untilFilter}T23:59:59.999Z`)
      const res = await authFetch(`/api/mail/emails?${params}`)
      const data = await res.json()
      if (data.success) {
        const newEmails = data.data as Email[]
        const hasMore = data.hasMore === true
        setListHasMore(hasMore)
        listHasMoreRef.current = hasMore
        if (append) {
          setEmails(prev => {
            const ids = new Set(prev.map(e => e.id))
            const merged = [...prev, ...newEmails.filter(e => !ids.has(e.id))]
            emailsRef.current = merged
            return merged
          })
          setAllEmails(prev => {
            const ids = new Set(prev.map(e => e.id))
            return [...prev, ...newEmails.filter(e => !ids.has(e.id))]
          })
        } else {
          if (silent && newEmails.length > emailCountRef.current) {
            const diff = newEmails.length - emailCountRef.current
            if (diff > 0) showToast(`${diff} nouveau(x) email(s)`)
          }
          emailCountRef.current = newEmails.length
          emailsRef.current = newEmails
          setAllEmails(newEmails)
          setEmails(newEmails)
        }
        if (activeFolder === 'inbox' && !append) {
          setInboxUnread(newEmails.filter((e: Email) => !e.is_read).length)
        }
        const sid = selectedIdRef.current
        if (sid && !append) {
          const updated = newEmails.find(e => e.id === sid)
          if (updated) setSelected(prev => prev ? { ...prev, ...updated } : updated)
        }
      }
    } catch (e) { console.error(e) }
    finally {
      clearTimeout(safetyTimer)
      if (!silent && !append) setLoading(false)
      if (append) {
        setLoadingMore(false)
        loadingMoreRef.current = false
      }
    }
  }, [filter, priorityFilter, fromFilter, tenderFilter, labelFilter, sinceFilter, untilFilter, folder, folderSelection, searchQuery, listListFilter])

  const handleDeleteFolder = useCallback(async (path: string) => {
    setFolderActionLoading(true)
    try {
      const res = await authFetch(`/api/mail/folders?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        setCustomFolders(data.data?.customFolders ?? [])
        if (folderSelection.kind === 'custom' && folderSelection.customPath === path) {
          handleSelectionChange({ kind: 'inbox' })
        }
        showToast('Dossier supprimé')
        return true
      }
      showToast(data.error ?? 'Erreur suppression dossier')
      return false
    } catch {
      showToast('Erreur suppression dossier')
      return false
    } finally {
      setFolderActionLoading(false)
    }
  }, [folderSelection])

  const runSync = useCallback(async (silent = true, force = false) => {
    if (syncInProgressRef.current && !force) return
    if (force && syncAbortRef.current) {
      syncAbortRef.current.abort()
      syncInProgressRef.current = false
    }
    syncInProgressRef.current = true
    const abortController = new AbortController()
    syncAbortRef.current = abortController
    const syncTimeout = setTimeout(() => abortController.abort(), force ? 55000 : 35000)
    try {
      setSyncing(true)
      const res = await authFetch('/api/mail/sync', {
        method: 'POST',
        body: JSON.stringify({
          backfill: force && !silent,
          quick: silent && !force,
        }),
        signal: abortController.signal,
      })
      const data = await res.json()
      if (data.success) {
        const {
          stored = 0,
          updated = 0,
          quickStored = 0,
          fetched = 0,
          errors = 0,
          duplicates = 0,
          skippedOutbound = 0,
          mailboxes,
          accounts,
        } = data.data ?? {}
        const total = stored + updated
        const myReport = accounts?.find((a: { user_id: string }) => a.user_id === userId)
        if (myReport?.status === 'skipped' && myReport.reason === 'compte_mail_non_configure') {
          const msg = 'Paramètres → Messagerie : configurez IMAP pour ce compte'
          if (!silent) showToast(msg)
          setAutoSyncStatus('Messagerie non configurée')
        } else {
          const summary = `${fetched} lus · ${stored} nouveaux · ${updated} maj · ${errors} err`
          if (!silent && errors > 0) {
            showToast(`Sync : ${summary}`)
          } else if (!silent && total === 0 && fetched === 0) {
            showToast('IMAP : aucun mail récupéré — vérifiez Paramètres → Messagerie')
          } else if (!silent && total === 0) {
            const skipHint = skippedOutbound > 0 ? `, ${skippedOutbound} envoyés ignorés` : ''
            showToast(`Boîte à jour (${fetched} vérifiés, ${duplicates} déjà en base${skipHint})`)
          } else if (!silent && total > 0) {
            showToast(`${total} email(s) synchronisé(s) · ${summary}`)
          } else if (!silent && quickStored > 0) {
            showToast(`${quickStored} nouveau(x) email(s)`)
          }
          const syncTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          if (folder === 'sent' && mailboxes && !mailboxes.sent) {
            setAutoSyncStatus(`Synchro ${syncTime} — dossier Envoyés introuvable sur IMAP`)
          } else {
            setAutoSyncStatus(`Synchro : ${syncTime}`)
          }
        }
        refreshFolders()
        await loadEmails(true)
        const sid = selectedIdRef.current
        if (sid && (updated > 0 || stored > 0)) await loadEmailDetail(sid, true)
      } else {
        const err = data.error ?? 'Synchronisation impossible'
        const accounts = data.data?.accounts as Array<{ status: string; reason?: string; email?: string }> | undefined
        const failed = accounts?.find(a => a.status === 'error')
        if (!silent) {
          if (err.includes('compte mail') || err.includes('Messagerie')) {
            showToast('Paramètres → Messagerie : configurez IMAP et mot de passe')
          } else if (failed?.reason) {
            showToast(`Erreur IMAP : ${failed.reason}`)
          } else {
            showToast(`Erreur : ${err}`)
          }
        } else if (err.includes('Limite de synchronisation')) {
          setAutoSyncStatus(`Sync limitée — ${err.replace('Limite de synchronisation atteinte. ', '')}`)
        } else if (err.includes('compte mail') || err.includes('Messagerie')) {
          setAutoSyncStatus('Messagerie non configurée')
        } else if (failed?.reason) {
          setAutoSyncStatus(`Erreur sync : ${failed.reason.slice(0, 40)}`)
        }
      }
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string }
      if (err.name === 'AbortError') {
        if (!silent) showToast('Sync trop longue — réessayez')
      } else if (!silent) {
        showToast(`Erreur : ${err.message ?? 'réseau'}`)
      }
    } finally {
      clearTimeout(syncTimeout)
      syncInProgressRef.current = false
      if (syncAbortRef.current === abortController) syncAbortRef.current = null
      setSyncing(false)
    }
  }, [loadEmails, loadEmailDetail, refreshFolders, folder, userId])

  useEffect(() => {
    if (!ready) return
    if (!userId) {
      setLoading(false)
      return
    }
    void loadEmails(false)
  }, [filter, priorityFilter, fromFilter, tenderFilter, labelFilter, sinceFilter, untilFilter, ready, userId, loadEmails])

  useEffect(() => {
    if (!ready || !userId || initialSyncDoneRef.current) return
    initialSyncDoneRef.current = true
    void runSync(true)
  }, [ready, userId, runSync])

  // Sync automatique toutes les 5 minutes si visible
  useEffect(() => {
    if (!ready || !userId) return
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !syncInProgressRef.current) {
        void runSync(true)
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [ready, userId, runSync])

  // Realtime Supabase INSERT + UPDATE
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel(`emails-realtime-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'emails',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const raw = payload.new as Email
        const lite: Email = {
          id: raw.id, user_id: raw.user_id, message_id: raw.message_id,
          subject: raw.subject, from_address: raw.from_address, to_address: raw.to_address,
          body_text: null, body_html: null,
          received_at: raw.received_at, is_read: raw.is_read, is_ao: raw.is_ao,
          ao_score: raw.ao_score, tender_id: raw.tender_id, has_attachments: raw.has_attachments,
          created_at: raw.created_at,
        }
        setEmails(prev => {
          if (prev.some(e => e.id === lite.id)) return prev
          return [lite, ...prev]
        })
        emailCountRef.current += 1
        showToast(`Nouvel email : ${lite.subject?.slice(0, 40)}`)
        void runSync(true)
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'emails',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const raw = payload.new as Email
        const prev = emailsRef.current.find(e => e.id === raw.id)
        const lite: Partial<Email> = {
          subject: raw.subject, from_address: raw.from_address, received_at: raw.received_at,
          is_read: raw.is_read, is_ao: raw.is_ao, ao_score: raw.ao_score,
          tender_id: raw.tender_id, has_attachments: raw.has_attachments,
        }
        setEmails(prevList => prevList.map(e => e.id === raw.id ? { ...e, ...lite } : e))
        if (selectedIdRef.current === raw.id) {
          setSelected(prev => prev ? { ...prev, ...lite } : prev)
          // Recharger le détail seulement si les PJ viennent d'apparaître
          if (raw.has_attachments && !prev?.has_attachments) {
            loadEmailDetail(raw.id, true)
          }
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, loadEmailDetail])

  const handleSync = () => void runSync(false, true)

  const prefetchEmail = useCallback((emailId: string) => {
    if (emailId.startsWith('elog-')) return
    const cached = mailCache.current[emailId]
    if (cached?.body_html || cached?.body_text) return
    if (prefetchingRef.current.has(emailId)) return
    prefetchingRef.current.add(emailId)
    void fetchEmailDetail(emailId, { analyze: false, silent: true }).finally(() => {
      prefetchingRef.current.delete(emailId)
    })
  }, [fetchEmailDetail])

  const selectEmail = (email: Email) => {
    const cached = mailCache.current[email.id]
    setSelected(cached ? { ...email, ...cached } : email)
    setComposing(false)
    if (isMobile) setMobileShowDetail(true)
    const hasBody = Boolean(
      cached?.body_html || cached?.body_text || email.body_html || email.body_text,
    )
    if (!hasBody) {
      void loadEmailDetail(email.id)
    } else if (!cached?.quote_analysis) {
      void loadEmailDetail(email.id, true, { analyzeOnly: true })
    }
    if (!email.is_read) handleMarkRead(email)
  }

  useEffect(() => {
    const el = listScrollRef.current
    if (!el) return
    const onScroll = () => {
      if (loadingMoreRef.current || !listHasMoreRef.current || loading) return
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140
      if (nearBottom) void loadEmails(true, undefined, true)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [loadEmails, loading])

  useEffect(() => {
    if (!pendingEmailId || emails.length === 0) return
    const target = emails.find(e => e.id === pendingEmailId)
    if (target && selected?.id !== target.id) selectEmail(target)
  }, [pendingEmailId, emails, selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isComposeContentEmpty = useCallback(() => {
    const sig = getSignatureData()
    const plainBody = htmlToPlainText(compose.body)
    const bodyWithoutSig = stripSignatureFromBody(plainBody, sig.text).trim()
    return (
      !compose.to.trim() &&
      !compose.cc.trim() &&
      !compose.bcc.trim() &&
      !compose.subject.trim() &&
      !bodyWithoutSig &&
      attachments.length === 0
    )
  }, [compose, attachments])

  const cleanupDraft = useCallback(() => {
    if (userId && activeDraftId) removeDraft(userId, activeDraftId)
    if (serverDraftId) {
      void authFetch(`/api/mail/drafts?id=${encodeURIComponent(serverDraftId)}`, {
        method: 'DELETE',
      }).catch(() => {})
    }
    setActiveDraftId(null)
    setServerDraftId(null)
    if (folder === 'drafts' && userId) setDrafts(loadDrafts(userId))
  }, [userId, activeDraftId, serverDraftId, folder])

  const saveDraftNow = useCallback(async () => {
    if (!userId || !activeDraftId || isComposeContentEmpty()) return
    upsertDraft(userId, {
      id: activeDraftId,
      to: compose.to,
      cc: compose.cc,
      subject: compose.subject,
      body: compose.body,
      updatedAt: new Date().toISOString(),
    })
    try {
      const res = await authFetch('/api/mail/drafts', {
        method: 'POST',
        body: JSON.stringify({
          id: serverDraftId,
          to: compose.to,
          cc: compose.cc,
          bcc: compose.bcc,
          subject: compose.subject,
          body: compose.body,
        }),
      })
      const data = await res.json()
      if (data.success && data.data?.id) setServerDraftId(data.data.id)
      setDraftSavedLabel('Brouillon enregistré')
    } catch {}
    if (folder === 'drafts') setDrafts(loadDrafts(userId))
  }, [userId, activeDraftId, compose, serverDraftId, folder, isComposeContentEmpty])

  const closeCompose = () => {
    setCloseConfirmOpen(false)
    setComposing(false)
    setComposeMinimized(false)
    setSendError(null)
    setDraftSavedLabel(null)
  }

  const handleRequestCloseCompose = () => {
    if (isComposeContentEmpty()) {
      cleanupDraft()
      closeCompose()
      return
    }
    setCloseConfirmOpen(true)
  }

  const handleCloseWithoutSaving = () => {
    cleanupDraft()
    closeCompose()
  }

  const handleCloseWithSaving = async () => {
    await saveDraftNow()
    closeCompose()
  }

  const openCompose = (prefill: Partial<typeof compose> = {}, draftId?: string) => {
    setCompose({ to: '', cc: '', bcc: '', subject: '', body: '', ...prefill })
    setAttachments([])
    setActiveDraftId(draftId ?? newDraftId())
    setServerDraftId(null)
    setComposing(true)
    setComposeMinimized(false)
    setSendError(null)
    setDraftSavedLabel(null)
  }

  const handleDeleteDraft = () => {
    if (userId && activeDraftId) removeDraft(userId, activeDraftId)
    if (serverDraftId) {
      void authFetch(`/api/mail/drafts?id=${encodeURIComponent(serverDraftId)}`, {
        method: 'DELETE',
      }).catch(() => {})
    }
    setActiveDraftId(null)
    setServerDraftId(null)
    closeCompose()
    if (folder === 'drafts' && userId) setDrafts(loadDrafts(userId))
  }

  useEffect(() => {
    if (!composing || !userId || !activeDraftId) return
    const interval = setInterval(() => {
      if (isComposeContentEmpty()) {
        removeDraft(userId, activeDraftId)
        if (serverDraftId) {
          void authFetch(`/api/mail/drafts?id=${encodeURIComponent(serverDraftId)}`, {
            method: 'DELETE',
          }).catch(() => {})
          setServerDraftId(null)
        }
        setDraftSavedLabel(null)
        if (folder === 'drafts') setDrafts(loadDrafts(userId))
        return
      }
      upsertDraft(userId, {
        id: activeDraftId,
        to: compose.to,
        cc: compose.cc,
        subject: compose.subject,
        body: compose.body,
        updatedAt: new Date().toISOString(),
      })
      void authFetch('/api/mail/drafts', {
        method: 'POST',
        body: JSON.stringify({
          id: serverDraftId,
          to: compose.to,
          cc: compose.cc,
          bcc: compose.bcc,
          subject: compose.subject,
          body: compose.body,
        }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.success && d.data?.id) setServerDraftId(d.data.id)
          setDraftSavedLabel('Brouillon enregistré')
        })
        .catch(() => {})
      if (folder === 'drafts') setDrafts(loadDrafts(userId))
    }, 30000)
    return () => clearInterval(interval)
  }, [composing, compose, activeDraftId, userId, folder, serverDraftId, isComposeContentEmpty, attachments])

  const openReply = (email: Email) => {
    const originalLines = (email.body_text ?? '').split('\n').slice(0, 8).map(l => `> ${l}`).join('\n')
    openCompose({
      to: email.from_address ?? '',
      subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: originalLines ? `\n\n--- Message original ---\n${originalLines}` : '',
    })
  }

  const openForward = (email: Email) => {
    openCompose({
      subject: `Fwd: ${email.subject}`,
      body: `\n\n--- Message transféré ---\nDe : ${email.from_address}\nObjet : ${email.subject}\n\n${email.body_text ?? ''}`,
    })
  }

  const signaturePreview = composing ? getSignatureData() : { text: '', html: '' }

  const handleSend = async () => {
    const sig = getSignatureData()
    const isHtmlBody = compose.body.includes('<') && compose.body.includes('>')
    const bodyWithoutSig = isHtmlBody
      ? compose.body.trim()
      : stripSignatureFromBody(compose.body, sig.text)
    if (!compose.to || !compose.subject) {
      setSendError('Destinataire et sujet requis')
      return
    }
    if (!bodyWithoutSig.trim() && !sig.html.trim()) {
      setSendError('Message ou signature requis')
      return
    }
    setSending(true); setSendError(null)
    try {
      const signatureHtml = sig.html.trim()
      const attachmentPayload = await Promise.all(
        attachments.map(async f => ({
          filename: f.name,
          contentType: f.type || 'application/octet-stream',
          data: await fileToBase64(f),
        }))
      )

      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: compose.to,
          cc: compose.cc || undefined,
          bcc: compose.bcc || undefined,
          subject: compose.subject,
          body: bodyWithoutSig,
          signature: signatureHtml,
          attachments: attachmentPayload.length > 0 ? attachmentPayload : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        if (userId && activeDraftId) removeDraft(userId, activeDraftId)
        setActiveDraftId(null)
        closeCompose()
        void runSync(true, true)
        showToast('Email envoyé ✓')
      } else setSendError(data.error)
    } catch (e: any) { setSendError(e.message) }
    setSending(false)
  }

  const handleMarkRead = (email: Email) => {
    if (email.is_read) return
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e))
    setSelected(prev => prev?.id === email.id ? { ...prev, is_read: true } : prev)
    void authFetch('/api/mail/emails', {
      method: 'PATCH',
      body: JSON.stringify({ id: email.id, is_read: true }),
    }).catch(() => {
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: false } : e))
      setSelected(prev => prev?.id === email.id ? { ...prev, is_read: false } : prev)
    })
  }

  const handleMarkUnread = async (email: Email) => {
    if (!email.is_read) return
    try {
      await authFetch('/api/mail/emails', {
        method: 'PATCH',
        body: JSON.stringify({ id: email.id, is_read: false }),
      })
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: false } : e))
      setSelected(prev => prev?.id === email.id ? { ...prev, is_read: false } : prev)
      showToast('Marqué non lu')
    } catch {}
  }

  const downloadAttachment = async (emailId: string, index: number, filename: string) => {
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch(`/api/mail/emails/${emailId}/attachments/${index}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { showToast('Pièce jointe indisponible'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch { showToast('Erreur téléchargement') }
  }

  const handleCreateAo = async (email?: Email) => {
    const target = email ?? selected
    if (!target) return
    if (target.tender_id) {
      try {
        const checkRes = await authFetch(`/api/tenders/${target.tender_id}`)
        const checkData = await checkRes.json()
        if (checkData.success && checkData.data?.source_email_id === target.id) {
          router.push(`/tenders/${target.tender_id}`)
          return
        }
      } catch { /* créer un nouvel AO si lien incorrect */ }
    }
    setCreatingAoId(target.id)
    if (!email) setCreating(true)
    try {
      const res = await authFetch(`/api/mail/emails/${target.id}/ao`, { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      if (data.success) {
        const tenderId = data.data.tender_id
        setEmails(prev => prev.map(e => e.id === target.id ? { ...e, tender_id: tenderId, is_ao: true, ao_score: Math.max(e.ao_score ?? 0, 80) } : e))
        if (selected?.id === target.id) {
          setSelected(prev => prev ? { ...prev, tender_id: tenderId, is_ao: true, ao_score: Math.max(prev.ao_score ?? 0, 80) } : prev)
        }
        showToast('AO créé !')
        router.push(`/tenders/${tenderId}`)
      } else showToast(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      showToast(`Erreur : ${err.message ?? 'réseau'}`)
    }
    setCreatingAoId(null)
    setCreating(false)
  }

  const handleUnlinkTender = async (email: Email) => {
    try {
      const res = await authFetch('/api/mail/emails', {
        method: 'PATCH',
        body: JSON.stringify({ id: email.id, tender_id: null }),
      })
      const data = await res.json()
      if (!data.success) { showToast(`Erreur : ${data.error}`); return }
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, tender_id: null } : e))
      if (selected?.id === email.id) setSelected(prev => prev ? { ...prev, tender_id: null } : prev)
      showToast('Email délié de l\'AO')
    } catch { showToast('Erreur déliaison') }
  }

  const openLinkTenderModal = async (email?: Email) => {
    if (email) setSelected(email)
    setLinkModalOpen(true)
    try {
      const res = await authFetch('/api/tenders')
      const data = await res.json()
      if (data.success) {
        const list = (data.data ?? []).map((t: { id?: string; tender_id?: string; title: string; client: string }) => ({
          id: t.id ?? t.tender_id ?? '',
          title: t.title,
          client: t.client,
        })).filter((t: { id: string }) => t.id)
        setTendersForLink(list)
      }
    } catch { showToast('Impossible de charger les AO') }
  }

  const handleLinkToTender = async (tenderId: string, email?: Email) => {
    const target = email ?? selected
    if (!target) return
    setLinkingTender(true)
    try {
      const res = await authFetch('/api/mail/emails', {
        method: 'PATCH',
        body: JSON.stringify({ id: target.id, tender_id: tenderId }),
      })
      const data = await res.json()
      if (data.success) {
        const updated = data.data as Email
        const patch = {
          tender_id: tenderId,
          labels: updated.labels ?? target.labels,
        }
        setEmails(prev => prev.map(e => e.id === target.id ? { ...e, ...patch } : e))
        if (selected?.id === target.id) setSelected(prev => prev ? { ...prev, ...patch } : prev)
        setLinkModalOpen(false)
        showToast('Email lié à l\'AO')
      } else showToast(`Erreur : ${data.error}`)
    } catch { showToast('Erreur liaison') }
    setLinkingTender(false)
  }

  const patchEmail = async (emailId: string, patch: Record<string, unknown>) => {
    const res = await authFetch('/api/mail/emails', {
      method: 'PATCH',
      body: JSON.stringify({ id: emailId, ...patch }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error ?? 'Erreur')
    return data.data as Email
  }

  const applyEmailPatch = (emailId: string, patch: Partial<Email>) => {
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, ...patch } : e))
    setSelected(prev => prev?.id === emailId ? { ...prev, ...patch } : prev)
  }

  const handleSetPriority = async (email: Email, priority: EmailPriority) => {
    try {
      await patchEmail(email.id, { priority })
      applyEmailPatch(email.id, { priority })
      setContextMenuEmailId(null)
      showToast(`Priorité : ${PRIORITY_STYLES[priority].label}`)
    } catch {
      showToast('Erreur priorité')
    }
  }

  const handleToggleLabel = async (email: Email, label: EmailLabel) => {
    const current = email.labels ?? []
    const has = current.some(l => l.id === label.id)
    const next = has ? current.filter(l => l.id !== label.id) : [...current, label]
    try {
      await patchEmail(email.id, { labels: next })
      applyEmailPatch(email.id, { labels: next })
      showToast(has ? `Étiquette retirée` : `Étiquette « ${label.name} »`)
    } catch {
      showToast('Erreur étiquette')
    }
  }

  const handleMarkAsAo = async (email: Email) => {
    try {
      await authFetch('/api/mail/emails', {
        method: 'PATCH',
        body: JSON.stringify({ id: email.id, is_ao: true, ao_score: Math.max(email.ao_score ?? 0, 50) }),
      })
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_ao: true, ao_score: Math.max(e.ao_score ?? 0, 50) } : e))
      if (selected?.id === email.id) {
        setSelected(prev => prev ? { ...prev, is_ao: true, ao_score: Math.max(prev.ao_score ?? 0, 50) } : prev)
      }
      showToast('Marqué comme AO')
    } catch {
      showToast('Erreur marquage AO')
    }
  }

  const unreadTotal = folder === 'inbox'
    ? emails.filter(e => !e.is_read).length
    : inboxUnread
  const grouped = groupEmailsByDate(emails)
  const folderBadges: Partial<Record<string, number>> = {
    inbox: unreadTotal,
    drafts: drafts.length,
  }

  const handleMoveToFolder = async (email: Email, target: 'spam' | 'trash') => {
    try {
      await mailAction('move', { emailId: email.id, target })
      setEmails(prev => prev.filter(e => e.id !== email.id))
      setSelected(null)
      showToast(target === 'spam' ? 'Déplacé vers indésirables' : 'Déplacé vers corbeille')
    } catch {
      showToast('Erreur déplacement')
    }
  }

  const handleRestore = async (email: Email) => {
    try {
      await mailAction('restore', { emailId: email.id })
      setEmails(prev => prev.filter(e => e.id !== email.id))
      setSelected(null)
      showToast('Mail restauré')
    } catch {
      showToast('Erreur restauration')
    }
  }

  const handleNotSpam = async (email: Email) => {
    try {
      await mailAction('not_spam', { emailId: email.id })
      setEmails(prev => prev.filter(e => e.id !== email.id))
      setSelected(null)
      showToast('Déplacé vers courrier entrant')
    } catch {
      showToast('Erreur')
    }
  }

  const handleEmptyTrash = async () => {
    try {
      const data = await mailAction('empty_trash')
      showToast(`Corbeille vidée (${data.data?.deleted ?? 0} mail(s))`)
      loadEmails(false)
    } catch {
      showToast('Erreur vidage corbeille')
    }
  }

  const lastSyncLabel = autoSyncStatus ?? 'Sync non effectuée'

  const showList = !isMobile || !mobileShowDetail
  const showPanel = !isMobile || mobileShowDetail

  const filterButtons: { key: MailFilter; label: string }[] = [
    { key: 'all', label: 'Tous' },
    { key: 'unread', label: 'Non lus' },
    { key: 'attachments', label: 'PJ' },
    { key: 'ao', label: 'AO' },
  ]

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: isMobile ? 'calc(100vh - 56px)' : 'calc(100vh - 0px)',
      margin: isMobile ? '-16px -12px' : '-24px -28px',
      overflow: 'hidden',
    }}>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, left: isMobile ? 12 : 'auto', zIndex: 200,
          background: 'var(--bg-card)', border: '1px solid var(--border-hi)', borderRadius: 10,
          padding: '10px 16px', fontSize: 12, color: 'var(--text-primary)',
          fontFamily: 'DM Mono, monospace', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {!isMobile && (
        <MailToolbar
          onNewMail={() => openCompose()}
          onRefresh={handleSync}
          syncing={syncing}
          lastSyncLabel={lastSyncLabel}
          search={searchQuery}
          onSearchChange={v => { setSearchQuery(v); loadEmails(false) }}
          listFilter={listListFilter}
          onListFilterChange={f => { setListListFilter(f); if (f === 'unread') setFilter('unread'); else if (f === 'attachments') setFilter('attachments'); else setFilter('all') }}
          showAoFilter={folder === 'inbox'}
        />
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {!isMobile && (
        <MailFolderSidebar
          accounts={mailAccounts}
          accountEmail={mailAccountEmail}
          selection={folderSelection}
          onSelectionChange={handleSelectionChange}
          badges={folderBadges}
          customFolders={customFolders}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          folderActionLoading={folderActionLoading}
        />
      )}

      {/* Liste emails */}
      {showList && (
        <div style={{
          width: isMobile ? '100%' : 320,
          borderRight: isMobile ? 'none' : '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)', flexShrink: 0,
        }}>
          <div style={{ padding: isMobile ? '12px 12px 10px' : '8px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {folder === 'trash' && emails.length > 0 && (
              <button type="button" onClick={() => void handleEmptyTrash()} style={{ marginBottom: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)' }}>
                Vider la corbeille
              </button>
            )}
            {isMobile && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                {(['inbox', 'drafts', 'sent', 'spam', 'trash'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleSelectionChange({ kind: f })}
                    style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                      border: 'none',
                      background: folder === f ? 'var(--accent-soft)' : 'var(--bg-hover)',
                      color: folder === f ? 'var(--accent)' : 'var(--text-muted)',
                      fontFamily: 'DM Sans, system-ui',
                    }}
                  >
                    {f === 'inbox' ? 'Entrant' : f === 'drafts' ? 'Brouillons' : f === 'sent' ? 'Envoyés' : f === 'spam' ? 'Spam' : 'Corbeille'}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
              <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: isMobile ? 15 : 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                    {folder === 'inbox' ? 'Courrier entrant' : folder === 'drafts' ? 'Brouillons' : folder === 'sent' ? 'Envoyés' : folder === 'spam' ? 'Indésirables' : 'Corbeille'}
                  </span>
                  {unreadTotal > 0 && (
                    <span style={{
                      background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700,
                      padding: '1px 6px', fontFamily: 'DM Mono, monospace', lineHeight: 1.4, flexShrink: 0,
                    }}>{unreadTotal}</span>
                  )}
                </div>
                {autoSyncStatus && (
                  <div style={{
                    fontSize: 9, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace',
                    marginTop: 4, lineHeight: 1.3, whiteSpace: 'nowrap',
                  }}>
                    {autoSyncStatus}
                  </div>
                )}
              </div>
              {isMobile && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <button
                    type="button"
                    data-tour="mail-sync"
                    onClick={handleSync}
                    disabled={syncing}
                    title="Synchroniser la boîte mail"
                    style={{
                      background: syncing ? 'var(--bg-hover)' : 'transparent',
                      border: '1px solid var(--border-hi)',
                      color: syncing ? 'var(--text-muted)' : 'var(--text-secondary)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      minHeight: 36,
                      minWidth: 44,
                      fontSize: 11,
                      cursor: syncing ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontFamily: 'DM Sans, system-ui',
                      fontWeight: 600,
                      flexShrink: 0,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {syncing ? <Spinner size={12} /> : <span style={{ fontSize: 13, lineHeight: 1 }}>↻</span>}
                    <span>Synchroniser</span>
                  </button>
                  <button onClick={() => openCompose()} style={{
                    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7,
                    padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                  }}>+ Nouveau mail</button>
                </div>
              )}
            </div>

            {folder === 'inbox' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {filterButtons.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: 'none',
                  background: filter === f.key ? 'var(--accent-soft)' : 'transparent',
                  color: filter === f.key ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'DM Sans, system-ui',
                }}>{f.label}</button>
              ))}
            </div>
            )}

            {folder === 'inbox' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value as EmailPriority | '')}
                style={{
                  fontSize: 11, padding: '4px 8px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text-secondary)', fontFamily: 'DM Sans, system-ui',
                }}
              >
                <option value="">Priorité</option>
                <option value="urgent">Urgent</option>
                <option value="normal">Normal</option>
                <option value="info">Info</option>
              </select>
              <input
                type="text"
                value={fromFilter}
                onChange={e => setFromFilter(e.target.value)}
                placeholder="Expéditeur…"
                style={{
                  flex: 1, minWidth: 100, fontSize: 11, padding: '4px 8px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui',
                }}
              />
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(v => !v)}
                style={{
                  fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid var(--border)', background: showAdvancedFilters ? 'var(--accent-soft)' : 'var(--bg-card)',
                  color: showAdvancedFilters ? 'var(--accent)' : 'var(--text-muted)',
                  fontFamily: 'DM Sans, system-ui',
                }}
              >
                Filtres {showAdvancedFilters ? '▾' : '▸'}
              </button>
            </div>
            )}
            {folder === 'inbox' && showAdvancedFilters && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                <select
                  value={tenderFilter}
                  onChange={e => setTenderFilter(e.target.value)}
                  style={{
                    flex: 1, minWidth: 120, fontSize: 11, padding: '4px 8px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-secondary)', fontFamily: 'DM Sans, system-ui',
                  }}
                >
                  <option value="">AO (tous)</option>
                  {tendersForFilter.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <select
                  value={labelFilter}
                  onChange={e => setLabelFilter(e.target.value)}
                  style={{
                    fontSize: 11, padding: '4px 8px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-secondary)', fontFamily: 'DM Sans, system-ui',
                  }}
                >
                  <option value="">Étiquette</option>
                  {PRESET_EMAIL_LABELS.map(l => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={sinceFilter}
                  onChange={e => setSinceFilter(e.target.value)}
                  title="Depuis"
                  style={{
                    fontSize: 11, padding: '4px 8px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-secondary)', fontFamily: 'DM Sans, system-ui',
                  }}
                />
                <input
                  type="date"
                  value={untilFilter}
                  onChange={e => setUntilFilter(e.target.value)}
                  title="Jusqu'au"
                  style={{
                    fontSize: 11, padding: '4px 8px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-secondary)', fontFamily: 'DM Sans, system-ui',
                  }}
                />
              </div>
            )}
          </div>

          <div ref={listScrollRef} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {folder === 'drafts' && drafts.length > 0 && drafts.map(draft => (
                <div
                  key={draft.id}
                  onClick={() => openCompose({
                    to: draft.to,
                    cc: draft.cc,
                    subject: draft.subject,
                    body: draft.body,
                  }, draft.id)}
                  style={{
                    padding: isMobile ? '14px 12px' : '12px 14px',
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {draft.subject || '(sans objet)'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {draft.to || 'Pas de destinataire'} · {formatMailTime(draft.updatedAt)}
                  </div>
                </div>
              ))}
            {folder === 'drafts' && drafts.length === 0 && !loading && emails.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, fontSize: 12, color: 'var(--text-muted)' }}>
                Aucun brouillon — synchronisez ou créez un message
              </div>
            )}
            {(!ready || (loading && emails.length === 0 && (folder !== 'drafts' || drafts.length === 0))) ? (
              <MailListSkeleton />
            ) : emails.length === 0 && folder !== 'drafts' ? (
              <div style={{ textAlign: 'center', padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {syncing ? 'Synchronisation en cours…' : 'Aucun email dans ce dossier'}
                </div>
                {folder === 'inbox' && (
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={syncing}
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 18px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: syncing ? 'wait' : 'pointer',
                    fontFamily: 'DM Sans, system-ui',
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {syncing ? <Spinner size={14} /> : '↻'}
                  Synchroniser maintenant
                </button>
                )}
              </div>
            ) : grouped.map(group => (
              <div key={group.label}>
                <div style={{
                  padding: '8px 14px 4px', fontSize: 10, fontWeight: 600,
                  color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 1,
                }}>
                  {group.label}
                </div>
                {group.emails.map(email => (
                  <div key={email.id} onClick={() => selectEmail(email)}
                    onMouseEnter={() => prefetchEmail(email.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenuEmailId(email.id)
                    }}
                    style={{
                      padding: isMobile ? '14px 12px' : '12px 14px',
                      borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      background: selected?.id === email.id ? 'var(--bg-hover)' : 'transparent',
                      position: 'relative',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {!email.is_read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                          <span style={{
                            fontSize: 12, fontWeight: email.is_read ? 400 : 600,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            color: email.is_read ? 'var(--text-secondary)' : 'var(--text-primary)',
                          }}>
                            {folder === 'sent'
                              ? `À : ${email.to_address?.split('<')[0].trim() || email.to_address || '—'}`
                              : email.from_address?.split('<')[0].trim() || email.from_address}
                          </span>
                        </div>
                        <div style={{
                          fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          color: email.is_read ? 'var(--text-muted)' : 'var(--text-primary)', marginBottom: 3,
                        }}>
                          {email.subject}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {email.priority && email.priority !== 'normal' && (
                            <span style={{
                              fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '1px 5px', borderRadius: 4,
                              background: PRIORITY_STYLES[email.priority].bg,
                              color: PRIORITY_STYLES[email.priority].color,
                              border: `1px solid ${PRIORITY_STYLES[email.priority].color}33`,
                            }}>
                              {PRIORITY_STYLES[email.priority].label}
                            </span>
                          )}
                          {email.is_ao && (
                            <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>AO</span>
                          )}
                          {email.tender_id && (
                            <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '1px 5px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>Lié</span>
                          )}
                          {email.has_attachments && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📎</span>
                          )}
                          {(email.labels ?? []).map(label => (
                            <span key={label.id} style={{
                              fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '1px 5px', borderRadius: 4,
                              background: `${label.color}18`, color: label.color,
                              border: `1px solid ${label.color}40`,
                            }}>
                              {label.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                          {formatMailTime(email.received_at)}
                        </span>
                        <button
                          type="button"
                          title="Priorité"
                          onClick={(e) => {
                            e.stopPropagation()
                            setContextMenuEmailId(contextMenuEmailId === email.id ? null : email.id)
                          }}
                          style={{
                            background: 'transparent', color: 'var(--text-muted)',
                            border: '1px solid var(--border)', borderRadius: 6,
                            padding: '2px 6px', fontSize: 10, cursor: 'pointer',
                            fontFamily: 'DM Mono, monospace',
                          }}
                        >
                          ⋮
                        </button>
                        <button
                          type="button"
                          title={email.tender_id ? 'Voir l\'AO' : 'Créer un appel d\'offres'}
                          disabled={creatingAoId === email.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (email.tender_id) router.push(`/tenders/${email.tender_id}`)
                            else if (email.is_ao) handleCreateAo(email)
                            else openLinkTenderModal(email)
                          }}
                          style={{
                            background: email.tender_id ? 'rgba(34,197,94,0.12)' : email.is_ao ? 'rgba(245,158,11,0.15)' : 'var(--bg-hover)',
                            color: email.tender_id ? '#4ade80' : email.is_ao ? '#fbbf24' : 'var(--text-secondary)',
                            border: `1px solid ${email.tender_id ? 'rgba(34,197,94,0.25)' : email.is_ao ? 'rgba(245,158,11,0.25)' : 'var(--border-hi)'}`,
                            borderRadius: 6,
                            padding: '3px 8px',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: creatingAoId === email.id ? 'wait' : 'pointer',
                            fontFamily: 'DM Mono, monospace',
                            minHeight: 28,
                            minWidth: 36,
                            opacity: creatingAoId === email.id ? 0.6 : 1,
                          }}
                        >
                          {creatingAoId === email.id ? '…' : email.tender_id ? 'Voir' : email.is_ao ? 'AO' : 'Lier'}
                        </button>
                      </div>
                    </div>
                    {contextMenuEmailId === email.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: 'absolute', right: 8, top: '100%', zIndex: 10,
                          background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
                          borderRadius: 8, padding: 4, minWidth: 130,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                        }}
                      >
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', padding: '4px 8px', fontFamily: 'DM Mono, monospace' }}>PRIORITÉ</div>
                        {(['urgent', 'normal', 'info'] as EmailPriority[]).map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handleSetPriority(email, p)}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '6px 8px', border: 'none', borderRadius: 6, cursor: 'pointer',
                              background: email.priority === p ? PRIORITY_STYLES[p].bg : 'transparent',
                              color: PRIORITY_STYLES[p].color, fontSize: 11, fontFamily: 'DM Sans, system-ui',
                            }}
                          >
                            {PRIORITY_STYLES[p].label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {loadingMore && (
              <div style={{ padding: '8px 0' }}>
                <MailListSkeleton rows={3} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Panel détail / compositeur */}
      {showPanel && (
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selected ? (
            <div style={{ padding: isMobile ? '12px 14px' : '20px 24px' }}>
              {isMobile && (
                <button onClick={() => { setMobileShowDetail(false); setSelected(null) }} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                  fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans, system-ui',
                }}>← Retour</button>
              )}

              {folder !== 'sent' && selected.mail_folder !== 'sent' && !selected.tender_id && (
                <div style={{
                  background: selected.is_ao ? 'rgba(59,126,246,0.08)' : 'var(--bg-card)',
                  border: selected.is_ao ? '1px solid rgba(59,126,246,0.2)' : '1px solid var(--border)',
                  borderRadius: 10, padding: '12px 16px', marginBottom: 16,
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: 12, color: selected.is_ao ? '#93c5fd' : 'var(--text-muted)', flex: 1 }}>
                    {selected.is_ao ? `AO détecté — Score ${selected.ao_score}/100` : 'Non lié à un AO'}
                  </span>
                  {!selected.is_ao && (
                    <button type="button" onClick={() => handleMarkAsAo(selected)} style={{
                      background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-hi)',
                      borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                    }}>Marquer AO</button>
                  )}
                  {selected.is_ao && (
                    <button type="button" onClick={() => handleCreateAo()} disabled={creating} style={{
                      background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7,
                      padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      opacity: creating ? 0.5 : 1, fontFamily: 'DM Sans, system-ui',
                    }}>
                      {creating ? '...' : '+ Créer AO'}
                    </button>
                  )}
                  <button type="button" onClick={() => openLinkTenderModal()} style={{
                    background: 'transparent', color: 'var(--accent)', border: '1px solid rgba(59,126,246,0.35)',
                    borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                  }}>
                    Lier à un AO
                  </button>
                </div>
              )}
              {selected.tender_id && (
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#86efac', flex: 1 }}>
                    Lié à un AO
                    {(selected as Email & { quote_analysis?: { price_ht: number | null } }).quote_analysis?.price_ht
                      ? ` — ${Number((selected as Email & { quote_analysis?: { price_ht: number | null } }).quote_analysis!.price_ht).toLocaleString('fr-FR')} € HT estimé`
                      : ''}
                  </span>
                  <button type="button" onClick={() => router.push(`/tenders/${selected.tender_id}`)} style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                    Voir l&apos;AO →
                  </button>
                  <button type="button" onClick={() => handleUnlinkTender(selected)} style={{ background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                    Délier
                  </button>
                </div>
              )}
              {(selected as Email & { quote_analysis?: { supplier_missing?: boolean; price_ht?: number | null } }).quote_analysis?.supplier_missing && (
                <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 12, color: '#fbbf24' }}>
                  Fournisseur non reconnu ({selected.from_address}). Mettez cette adresse (ou le même domaine) sur le fournisseur consulté.
                </div>
              )}

              <div style={{ fontSize: isMobile ? 16 : 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{selected.subject}</div>
              <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.8 }}>
                {(folder === 'sent' || selected.mail_folder === 'sent') ? (
                  <div>À : <span style={{ color: 'var(--text-secondary)' }}>{selected.to_address || '—'}</span></div>
                ) : (
                  <div>De : <span style={{ color: 'var(--text-secondary)' }}>{selected.from_address}</span></div>
                )}
                <div>Date : <span style={{ color: 'var(--text-secondary)' }}>{selected.received_at ? new Date(selected.received_at).toLocaleString('fr-FR') : '—'}</span></div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Priorité
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['urgent', 'normal', 'info'] as EmailPriority[]).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleSetPriority(selected, p)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                        border: selected.priority === p ? `1px solid ${PRIORITY_STYLES[p].color}` : '1px solid var(--border)',
                        background: selected.priority === p ? PRIORITY_STYLES[p].bg : 'transparent',
                        color: PRIORITY_STYLES[p].color, fontFamily: 'DM Sans, system-ui',
                      }}
                    >
                      {PRIORITY_STYLES[p].label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Étiquettes
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PRESET_EMAIL_LABELS.map(label => {
                    const active = (selected.labels ?? []).some(l => l.id === label.id)
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => handleToggleLabel(selected, label)}
                        style={{
                          padding: '3px 8px', borderRadius: 12, fontSize: 10, cursor: 'pointer',
                          border: `1px solid ${active ? label.color : 'var(--border)'}`,
                          background: active ? `${label.color}22` : 'transparent',
                          color: active ? label.color : 'var(--text-muted)',
                          fontFamily: 'DM Mono, monospace',
                        }}
                      >
                        {label.name}
                      </button>
                    )
                  })}
                  {(selected.labels ?? []).filter(l => !PRESET_EMAIL_LABELS.some(p => p.id === l.id)).map(label => (
                    <span key={label.id} style={{
                      padding: '3px 8px', borderRadius: 12, fontSize: 10,
                      background: `${label.color}22`, color: label.color,
                      border: `1px solid ${label.color}40`, fontFamily: 'DM Mono, monospace',
                    }}>
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <button onClick={() => openReply(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>↩ Répondre</button>
                <button onClick={() => openForward(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>→ Transférer</button>
                {selected.is_read ? (
                  <button onClick={() => handleMarkUnread(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Marquer non lu</button>
                ) : (
                  <button onClick={() => handleMarkRead(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Marquer lu</button>
                )}
                {folder === 'spam' && (
                  <button type="button" onClick={() => handleNotSpam(selected)} style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Pas un indésirable</button>
                )}
                {folder === 'trash' && (
                  <button type="button" onClick={() => handleRestore(selected)} style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Restaurer</button>
                )}
                {folder !== 'spam' && folder !== 'trash' && (
                  <>
                    <button type="button" onClick={() => handleMoveToFolder(selected, 'spam')} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Indésirable</button>
                    <button type="button" onClick={() => handleMoveToFolder(selected, 'trash')} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-muted)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Corbeille</button>
                  </>
                )}
              </div>

              {(selected.attachments?.length ?? 0) > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Pièces jointes ({selected.attachments!.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(selected.attachments as EmailAttachment[]).map((att, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {att.filename}</div>
                          <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                            {formatFileSize(att.size)}{att.hasData || att.data ? '' : ' · fichier volumineux'}
                          </div>
                        </div>
                        {(att.hasData || att.data) ? (
                          <button onClick={() => downloadAttachment(selected.id, i, att.filename)} style={{
                            background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid rgba(59,126,246,0.2)',
                            borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                            fontFamily: 'DM Sans, system-ui',
                          }}>Télécharger</button>
                        ) : (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>Sync requis</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selected.has_attachments && !(selected.attachments?.length) && !loadingDetailBody && (
                <div style={{ marginBottom: 20, padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  Pièces jointes non importées —
                  <button type="button" onClick={() => loadEmailDetail(selected.id)} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'DM Sans, system-ui', padding: 4, minHeight: 32 }}>
                    analyser maintenant
                  </button>
                  {' ou '}
                  <button type="button" onClick={handleSync} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'DM Sans, system-ui', padding: 4, minHeight: 32 }}>
                    synchroniser
                  </button>
                </div>
              )}

              {loadingDetailBody && !selected.body_html && !selected.body_text ? (
                <MailBodySkeleton />
              ) : selected.body_html ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: '100%', overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: selected.body_html }} />
              ) : selected.body_text ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selected.body_text}</div>
              ) : null}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 12, padding: 24 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="40" height="40"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span style={{ fontSize: 12, textAlign: 'center' }}>Sélectionne un email ou compose un message</span>
              <button onClick={() => openCompose()} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui', marginTop: 8 }}>
                + Nouveau mail
              </button>
            </div>
          )}
        </div>
      )}

      </div>

      {composing && (
        <MailComposePopup
          compose={compose}
          onChange={patch => setCompose(c => ({ ...c, ...patch }))}
          onSend={handleSend}
          onRequestClose={handleRequestCloseCompose}
          closeConfirm={{
            open: closeConfirmOpen,
            onSave: () => void handleCloseWithSaving(),
            onDiscard: handleCloseWithoutSaving,
            onCancel: () => setCloseConfirmOpen(false),
          }}
          onMinimize={() => setComposeMinimized(true)}
          onRestore={() => setComposeMinimized(false)}
          onDelete={handleDeleteDraft}
          attachments={attachments}
          onRemoveAttachment={i => setAttachments(a => a.filter((_, j) => j !== i))}
          onAddAttachments={files => setAttachments(a => [...a, ...files])}
          sending={sending}
          sendError={sendError}
          draftSavedLabel={draftSavedLabel}
          isListening={isListening}
          onToggleSpeech={toggleSpeech}
          minimized={composeMinimized}
          signaturePreview={signaturePreview}
          SignaturePreview={SignaturePreview}
        />
      )}

      {linkModalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setLinkModalOpen(false)}
        >
          <div
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, maxWidth: 440, width: '100%', maxHeight: '70vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Lier à un appel d&apos;offres</div>
            {tendersForLink.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun AO disponible</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tendersForLink.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={linkingTender}
                    onClick={() => handleLinkToTender(t.id)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                      cursor: linkingTender ? 'wait' : 'pointer', fontFamily: 'DM Sans, system-ui',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.client}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
