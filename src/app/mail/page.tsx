'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { authFetch, getAccessToken } from '@/lib/auth-client'
import { useAuth } from '@/components/AuthProvider'
import { Email, EmailAttachment, EmailLabel, EmailPriority } from '@/types/database'
import { PRESET_EMAIL_LABELS } from '@/lib/mail-api'
import {
  applySmartLabelsToLabels,
  labelBadgeStyle,
  labelTooltip,
  manualLabel,
} from '@/lib/mail-smart-labels'
import { emitMailUnreadChanged } from '@/lib/mail-unread-events'
import { Spinner, useModalBodyLock } from '@/components/ui'
import { getSignatureData, stripSignatureFromBody } from '@/lib/email-signature'
import { groupEmailsByDate } from '@/lib/mail-grouping'
import { AO_CATEGORY_BADGE, type AoKeywordCategory } from '@/lib/ao-email-analysis'
import MailFolderSidebar from '@/components/mail/MailFolderSidebar'
import MailAddressLines from '@/components/mail/MailAddressLines'
import MailComposePopup from '@/components/mail/MailComposePopup'
import MailToolbar from '@/components/mail/MailToolbar'
import {
  initialMailSyncUI,
  SYNC_DONE_DISMISS_MS,
  type MailSyncUIState,
} from '@/lib/mail-sync-ui'
import { runResumableMailSync, loadLocalSyncProcessed } from '@/lib/mail-sync-client'
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
import { extractEmailAddress } from '@/lib/mail-attachments'
import type { OperisContact } from '@/lib/contacts'
import { cacheUserSettingsLocally } from '@/lib/user-settings'
import {
  mailListQueryKey,
  readMailListCache,
  writeMailListCache,
} from '@/lib/mail-list-cache'
import {
  getMailDetailCache,
  setMailDetailCache,
  hasMailBodyCached,
} from '@/lib/mail-detail-cache'
import MailVirtualList from '@/components/mail/MailVirtualList'
import { useCachedMailList } from '@/hooks/useCachedMailList'
import { pullMailDelta } from '@/lib/mail-cache-sync'
import {
  isLocalFirstFolder,
  folderKeyFromSelection,
  setLocalFlag,
  cachedToEmail,
  getCachedEmailById,
} from '@/lib/mailCache'

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

function isEmptyComposeHtml(html: string): boolean {
  const text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\s/g, '')
  return !text
}

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

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export default function MailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pendingEmailId = searchParams.get('email')
  const pendingCompose = searchParams.get('compose') === '1'
  const pendingTenderId = searchParams.get('tender_id') ?? ''
  const { session, ready } = useAuth()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listHasMore, setListHasMore] = useState(false)
  const [loadingDetailBody, setLoadingDetailBody] = useState(false)
  const [syncUI, setSyncUI] = useState<MailSyncUIState>(() => initialMailSyncUI())
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const syncDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showMailWelcome, setShowMailWelcome] = useState(false)
  const autoSyncBootRef = useRef(false)
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
  const [modalPortalReady, setModalPortalReady] = useState(false)
  useEffect(() => setModalPortalReady(true), [])
  useModalBodyLock(linkModalOpen)
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
  const [composeSource, setComposeSource] = useState<{
    emailId: string
    action: 'reply' | 'forward'
  } | null>(null)
  const [composeTenderId, setComposeTenderId] = useState<string | null>(null)
  const [linkTenderSearch, setLinkTenderSearch] = useState('')
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
  const [mobileFolderSidebarOpen, setMobileFolderSidebarOpen] = useState(false)
  const [listSortOrder, setListSortOrder] = useState<'desc' | 'asc'>('desc')
  const emailCountRef = useRef(0)
  const selectedIdRef = useRef<string | null>(null)
  const syncInProgressRef = useRef(false)
  const emailsRef = useRef<Email[]>([])
  const prefetchingRef = useRef<Set<string>>(new Set())
  const listScrollRef = useRef<HTMLDivElement>(null)
  const listHasMoreRef = useRef(false)
  const loadingMoreRef = useRef(false)
  const contactsRef = useRef<OperisContact[] | null>(null)
  const [senderFavorite, setSenderFavorite] = useState(false)
  selectedIdRef.current = selected?.id ?? null
  emailsRef.current = emails

  const userId = session?.user?.id

  const localFirst = isLocalFirstFolder(folderSelection)
  const localFolderKey = localFirst ? folderKeyFromSelection(folderSelection) : null
  const activeListFilter: MailFilter =
    folder === 'inbox' ? (listListFilter === 'all' ? filter : listListFilter) : 'all'

  const cachedListEmails = useCachedMailList(localFolderKey, {
    searchQuery,
    favoritesOnly,
    listFilter: activeListFilter,
    priorityFilter: priorityFilter || undefined,
    fromFilter,
    tenderFilter,
    labelFilter,
    sinceFilter,
    untilFilter,
    sortOrder: listSortOrder,
  })

  const getListCacheKey = useCallback((selection?: MailFolderSelection) => {
    if (!userId) return null
    const activeSelection = selection ?? folderSelection
    const activeFolder = activeSelection.kind
    const listFilter = activeFolder === 'inbox' ? (listListFilter === 'all' ? filter : listListFilter) : 'all'
    return mailListQueryKey(userId, activeSelection, {
      q: searchQuery.trim(),
      order: listSortOrder,
      listFilter,
      priority: priorityFilter || '',
      from: fromFilter.trim(),
      tender_id: tenderFilter,
      label: labelFilter,
      since: sinceFilter,
      until: untilFilter,
    })
  }, [
    userId, folderSelection, searchQuery, listSortOrder, listListFilter, filter,
    priorityFilter, fromFilter, tenderFilter, labelFilter, sinceFilter, untilFilter,
  ])

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
    const check = () => setIsMobile(window.innerWidth < 1025)
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
    setSelected(null)
    setComposing(false)
    if (isMobile) {
      setMobileShowDetail(false)
      setMobileFolderSidebarOpen(false)
    }
    if (sel.kind === 'drafts' && userId) {
      setDrafts(loadDrafts(userId))
      authFetch('/api/mail/drafts').then(r => r.json()).then(d => {
        if (d.success && Array.isArray(d.data)) {
          /* server drafts merged in drafts folder UI later */
        }
      }).catch(() => {})
    }
    if (isLocalFirstFolder(sel)) {
      setLoading(false)
      return
    }
    const cacheKey = getListCacheKey(sel)
    const cached = cacheKey ? readMailListCache(cacheKey) : null
    if (cached?.emails?.length) {
      setEmails(cached.emails)
      emailsRef.current = cached.emails
      setListHasMore(cached.hasMore)
      listHasMoreRef.current = cached.hasMore
      setLoading(false)
    } else {
      setEmails([])
      emailsRef.current = []
      setLoading(true)
    }
    loadEmails(Boolean(cached?.emails?.length), sel)
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
        quote_analysis: full.quote_analysis ?? getMailDetailCache(emailId)?.quote_analysis,
      }
      setMailDetailCache(emailId, merged)
      if (selectedIdRef.current === emailId) {
        setSelected(getMailDetailCache(emailId))
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
      return getMailDetailCache(emailId) as EmailWithQuote | null
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
    const idbRow = await getCachedEmailById(emailId)
    if (idbRow?.body_html || idbRow?.body_text) {
      const fromIdb = cachedToEmail(idbRow) as EmailWithQuote
      setMailDetailCache(emailId, fromIdb)
      if (options?.analyzeOnly) {
        void fetchEmailDetail(emailId, { analyze: true, silent: true })
        return
      }
      setSelected(fromIdb)
      if (!fromIdb.quote_analysis) void fetchEmailDetail(emailId, { analyze: true, silent: true })
      return
    }
    const cached = getMailDetailCache(emailId) as EmailWithQuote | null
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
      if (emailsRef.current.length === 0) setLoading(true)
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
      if (isLocalFirstFolder(activeSelection) && !append) {
        if (!silent) setLoading(false)
        return
      }
      const activeFolder = activeSelection.kind
      const offset = append ? emailsRef.current.length : 0
      const params = new URLSearchParams({
        limit: String(MAIL_LIST_PAGE_SIZE),
        offset: String(offset),
        folder: activeFolder,
        order: listSortOrder,
      })
      if (activeSelection.kind === 'custom' && activeSelection.customPath) {
        params.set('imap_path', activeSelection.customPath)
      }
      if (searchQuery.trim()) params.set('q', searchQuery.trim())
      if (favoritesOnly) params.set('starred', 'true')
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
          const cacheKey = getListCacheKey(activeSelection)
          if (cacheKey) writeMailListCache(cacheKey, { emails: newEmails, hasMore })
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
  }, [filter, priorityFilter, fromFilter, tenderFilter, labelFilter, sinceFilter, untilFilter, folder, folderSelection, searchQuery, listListFilter, listSortOrder, favoritesOnly, getListCacheKey])

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

  const finishSyncSuccess = useCallback((added: number, silent: boolean) => {
    const now = new Date().toISOString()
    setSyncUI({ status: 'done', added, lastSyncAt: now })
    if (syncDoneTimerRef.current) clearTimeout(syncDoneTimerRef.current)
    syncDoneTimerRef.current = setTimeout(() => {
      setSyncUI({ status: 'idle', lastSyncAt: now })
    }, SYNC_DONE_DISMISS_MS)
    if (!silent && added > 0) showToast(`${added} nouveau(x) mail(s)`)
    else if (!silent && added === 0) showToast('Boîte à jour')
  }, [])

  const runSync = useCallback(async (silent = true, force = false) => {
    if (syncInProgressRef.current && !force) return
    syncInProgressRef.current = true
    if (syncDoneTimerRef.current) clearTimeout(syncDoneTimerRef.current)

    try {
      const ok = await runResumableMailSync({
        reset: force && !silent,
        silent,
        onProgress: setSyncUI,
        onBatch: async () => { await pullMailDelta() },
        onError: message => {
          if (!silent) showToast(message)
          setSyncUI({ status: 'error', message })
        },
        onDone: added => { finishSyncSuccess(added, silent) },
      })

      if (ok) {
        refreshFolders()
        await pullMailDelta()
        if (!localFirst) await loadEmails(true)
        const sid = selectedIdRef.current
        if (sid) await loadEmailDetail(sid, true)
      }
    } finally {
      syncInProgressRef.current = false
    }
  }, [loadEmails, loadEmailDetail, refreshFolders, finishSyncSuccess, localFirst])

  useEffect(() => {
    if (!ready || !userId || autoSyncBootRef.current) return
    autoSyncBootRef.current = true
    void (async () => {
      try {
        const localProgress = loadLocalSyncProcessed()
        if (localProgress > 0) {
          void runSync(true, true)
          return
        }
        const accRes = await authFetch('/api/mail/accounts')
        const accJson = await accRes.json()
        if (!accJson.success || !accJson.data) return
        if (accJson.data.initial_sync_complete === true && accJson.data.sent_initial_sync_complete === true) return
        void runSync(true, true)
      } catch { /* ignore */ }
    })()
  }, [ready, userId, runSync])

  const dismissMailWelcome = useCallback(() => {
    setShowMailWelcome(false)
    void authFetch('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ mail_welcome_seen: true }),
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!userId) return
    void authFetch('/api/profile')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.mail_welcome_seen !== true) setShowMailWelcome(true)
      })
      .catch(() => {})
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void authFetch('/api/user-settings')
      .then(r => r.json())
      .then(d => { if (d.success) cacheUserSettingsLocally(d.data) })
      .catch(() => {})
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void pullMailDelta()
    const t = setInterval(() => { void pullMailDelta() }, 60_000)
    return () => clearInterval(t)
  }, [userId])

  useEffect(() => {
    if (!localFirst) return
    setEmails(cachedListEmails)
    emailsRef.current = cachedListEmails
    setListHasMore(false)
    listHasMoreRef.current = false
    setLoading(false)
    if (folder !== 'inbox') return
    const count = cachedListEmails.filter(e => !e.is_read).length
    setInboxUnread(count)
    const t = setTimeout(() => emitMailUnreadChanged(count), 400)
    return () => clearTimeout(t)
  }, [localFirst, cachedListEmails, folder])

  useEffect(() => {
    if (!ready) return
    if (!userId) {
      setLoading(false)
      return
    }
    if (localFirst) {
      setLoading(false)
      return
    }
    const cacheKey = getListCacheKey()
    const cached = cacheKey ? readMailListCache(cacheKey) : null
    if (cached?.emails?.length) {
      setEmails(cached.emails)
      emailsRef.current = cached.emails
      setListHasMore(cached.hasMore)
      listHasMoreRef.current = cached.hasMore
      setLoading(false)
      void loadEmails(true)
    } else {
      void loadEmails(false)
    }
  }, [filter, priorityFilter, fromFilter, tenderFilter, labelFilter, sinceFilter, untilFilter, ready, userId, loadEmails, getListCacheKey, localFirst])

  const syncing = syncUI.status === 'syncing'

  const handleSync = () => void runSync(false, true)

  const prefetchEmail = useCallback((emailId: string) => {
    if (emailId.startsWith('elog-')) return
    if (hasMailBodyCached(emailId)) return
    if (prefetchingRef.current.has(emailId)) return
    prefetchingRef.current.add(emailId)
    void getCachedEmailById(emailId).then(row => {
      if (row?.body_html || row?.body_text) {
        setMailDetailCache(emailId, cachedToEmail(row))
        prefetchingRef.current.delete(emailId)
        return
      }
      void fetchEmailDetail(emailId, { analyze: false, silent: true }).finally(() => {
        prefetchingRef.current.delete(emailId)
      })
    })
  }, [fetchEmailDetail])

  useEffect(() => {
    emails.slice(0, 15).forEach(e => prefetchEmail(e.id))
  }, [emails, prefetchEmail])

  const selectEmail = (email: Email) => {
    const cached = getMailDetailCache(email.id) as EmailWithQuote | null
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
    if (!el || localFirst) return
    const onScroll = () => {
      if (loadingMoreRef.current || !listHasMoreRef.current || loading) return
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140
      if (nearBottom) void loadEmails(true, undefined, true)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [loadEmails, loading, localFirst])

  useEffect(() => {
    if (!pendingEmailId) return
    const target = emails.find(e => e.id === pendingEmailId)
    if (target) {
      if (selected?.id !== target.id) selectEmail(target)
      return
    }
    void authFetch(`/api/mail/emails/${pendingEmailId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) selectEmail(data.data as Email)
      })
      .catch(() => {})
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
    setComposeSource(null)
    setComposeTenderId(null)
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

  const openCompose = (
    prefill: Partial<typeof compose> = {},
    draftId?: string,
    source?: { emailId: string; action: 'reply' | 'forward' },
    tenderId?: string | null,
  ) => {
    const inheritedTenderId = tenderId
      ?? (source ? emails.find(e => e.id === source.emailId)?.tender_id : null)
      ?? composeTenderId
    setCompose({ to: '', cc: '', bcc: '', subject: '', body: '', ...prefill })
    setAttachments([])
    setActiveDraftId(draftId ?? newDraftId())
    setServerDraftId(null)
    setComposeSource(source ?? null)
    setComposeTenderId(inheritedTenderId ?? null)
    setComposing(true)
    setComposeMinimized(false)
    setSendError(null)
    setDraftSavedLabel(null)
  }

  useEffect(() => {
    if (!composing || !userId) return
    if (contactsRef.current?.length) return
    void authFetch('/api/contacts')
      .then(r => r.json())
      .then(d => { if (d.success) contactsRef.current = d.data ?? [] })
      .catch(() => {})
  }, [composing, userId])

  useEffect(() => {
    const isSentView = folder === 'sent' || selected?.mail_folder === 'sent'
    if (!selected || isSentView) {
      setSenderFavorite(false)
      return
    }
    const senderEmail = extractEmailAddress(selected.from_address ?? '')
    if (!senderEmail) {
      setSenderFavorite(false)
      return
    }
    const fromCache = contactsRef.current?.find(c => c.email === senderEmail)
    if (fromCache) {
      setSenderFavorite(fromCache.is_favorite)
      return
    }
    void authFetch('/api/contacts')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          contactsRef.current = d.data ?? []
          const c = contactsRef.current?.find(x => x.email === senderEmail)
          setSenderFavorite(c?.is_favorite ?? false)
        }
      })
      .catch(() => {})
  }, [selected, folder])

  const toggleSenderFavorite = async () => {
    const isSentView = folder === 'sent' || selected?.mail_folder === 'sent'
    if (!selected || isSentView) return
    const senderEmail = extractEmailAddress(selected.from_address ?? '')
    if (!senderEmail) return
    const next = !senderFavorite
    setSenderFavorite(next)
    if (contactsRef.current) {
      const c = contactsRef.current.find(x => x.email === senderEmail)
      if (c) c.is_favorite = next
    }
    try {
      const res = await authFetch('/api/contacts', {
        method: 'PATCH',
        body: JSON.stringify({
          email: senderEmail,
          is_favorite: next,
          from_address: selected.from_address,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setSenderFavorite(!next)
        if (contactsRef.current) {
          const c = contactsRef.current.find(x => x.email === senderEmail)
          if (c) c.is_favorite = !next
        }
        showToast('Erreur favori')
      }
    } catch {
      setSenderFavorite(!next)
      showToast('Erreur favori')
    }
  }

  const pendingComposeDoneRef = useRef(false)
  useEffect(() => {
    if (!pendingCompose || !ready || pendingComposeDoneRef.current) return
    pendingComposeDoneRef.current = true
    const toParam = searchParams.get('to')
    openCompose(
      {
        to: toParam ?? '',
        subject: searchParams.get('subject') ?? '',
      },
      undefined,
      undefined,
      pendingTenderId || null,
    )
  }, [pendingCompose, pendingTenderId, ready, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

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
    openCompose(
      {
        to: email.from_address ?? '',
        subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: originalLines ? `\n\n--- Message original ---\n${originalLines}` : '',
      },
      undefined,
      { emailId: email.id, action: 'reply' },
    )
  }

  const openForward = (email: Email) => {
    openCompose(
      {
        subject: `Fwd: ${email.subject}`,
        body: `\n\n--- Message transféré ---\nDe : ${email.from_address}\nObjet : ${email.subject}\n\n${email.body_text ?? ''}`,
      },
      undefined,
      { emailId: email.id, action: 'forward' },
    )
  }

  const signaturePreview = composing ? getSignatureData() : { text: '', html: '' }

  const handleSend = async () => {
    const sig = getSignatureData()
    const signatureHtml = sig.html.trim()
    const isHtmlBody = compose.body.includes('<') && compose.body.includes('>')
    let bodyWithoutSig = isHtmlBody
      ? compose.body.trim()
      : stripSignatureFromBody(compose.body, sig.text)
    if (isHtmlBody && isEmptyComposeHtml(bodyWithoutSig)) bodyWithoutSig = ''
    const bodyForSend = appendSignatureToBody(bodyWithoutSig, signatureHtml, sig.text)
    if (!compose.to || !compose.subject) {
      setSendError('Destinataire et sujet requis')
      return
    }
    if (!bodyForSend.trim()) {
      setSendError('Message ou signature requis')
      return
    }
    const composeSourceLabelsBefore = composeSource
      ? (emails.find(e => e.id === composeSource.emailId)?.labels ?? [])
      : null

    if (composeSource) {
      const sourceEmail = emails.find(e => e.id === composeSource.emailId)
      if (sourceEmail) {
        const smartAction = composeSource.action === 'reply' ? 'replied' : 'forwarded'
        applyEmailPatch(sourceEmail.id, {
          labels: applySmartLabelsToLabels(sourceEmail.labels, smartAction),
        })
      }
    }

    setSending(true); setSendError(null)
    try {
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
          body: bodyForSend,
          replyToEmailId: composeSource?.action === 'reply' ? composeSource.emailId : undefined,
          forwardFromEmailId: composeSource?.action === 'forward' ? composeSource.emailId : undefined,
          tenderId: composeTenderId ?? undefined,
          attachments: attachmentPayload.length > 0 ? attachmentPayload : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        const updates = data.data?.smartLabelUpdates as Array<{ emailId: string; labels: EmailLabel[] }> | undefined
        if (updates?.length) {
          for (const u of updates) {
            applyEmailPatch(u.emailId, { labels: u.labels })
          }
        }
        if (userId && activeDraftId) removeDraft(userId, activeDraftId)
        setActiveDraftId(null)
        closeCompose()
        void runSync(true, true)
        showToast('Email envoyé ✓')
      } else {
        setSendError(data.error)
        if (composeSource && composeSourceLabelsBefore) {
          applyEmailPatch(composeSource.emailId, { labels: composeSourceLabelsBefore })
        }
      }
    } catch (e: any) {
      setSendError(e.message)
      if (composeSource && composeSourceLabelsBefore) {
        applyEmailPatch(composeSource.emailId, { labels: composeSourceLabelsBefore })
      }
    }
    setSending(false)
  }

  const handleMarkRead = (email: Email) => {
    if (email.is_read) return
    const nextCount = emailsRef.current.filter(e => !e.is_read && e.id !== email.id).length
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e))
    setSelected(prev => prev?.id === email.id ? { ...prev, is_read: true } : prev)
    void setLocalFlag(email.id, { is_read: true })
    emitMailUnreadChanged(nextCount)
    void authFetch('/api/mail/emails', {
      method: 'PATCH',
      body: JSON.stringify({ id: email.id, is_read: true }),
    }).catch(() => {
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: false } : e))
      setSelected(prev => prev?.id === email.id ? { ...prev, is_read: false } : prev)
      void setLocalFlag(email.id, { is_read: false })
      emitMailUnreadChanged(nextCount + 1)
    })
  }

  const handleMarkUnread = async (email: Email) => {
    if (!email.is_read) return
    const nextCount = emailsRef.current.filter(e => !e.is_read).length + 1
    try {
      await authFetch('/api/mail/emails', {
        method: 'PATCH',
        body: JSON.stringify({ id: email.id, is_read: false }),
      })
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: false } : e))
      setSelected(prev => prev?.id === email.id ? { ...prev, is_read: false } : prev)
      void setLocalFlag(email.id, { is_read: false })
      emitMailUnreadChanged(nextCount)
      showToast('Marqué non lu')
    } catch {}
  }

  const handleToggleStar = (email: Email) => {
    const next = !email.is_starred
    applyEmailPatch(email.id, { is_starred: next })
    void setLocalFlag(email.id, { is_starred: next })
    setContextMenuEmailId(null)
    void mailAction('star', { emailId: email.id, starred: next }).catch(() => {
      applyEmailPatch(email.id, { is_starred: !next })
      void setLocalFlag(email.id, { is_starred: !next })
      showToast('Erreur favori')
    })
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
        const checkRes = await authFetch(`/api/tenders/${target.tender_id}`, { timeoutMs: 20000 })
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
      const res = await authFetch(`/api/mail/emails/${target.id}/ao`, {
        method: 'POST',
        body: JSON.stringify({}),
        timeoutMs: 30000,
      })
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
    setLinkTenderSearch('')
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
    const previousTenderId = target.tender_id
    const previousLabels = target.labels
    const optimisticPatch = {
      tender_id: tenderId,
      is_ao: true,
      ao_score: Math.max(target.ao_score ?? 0, 60),
    }
    setEmails(prev => prev.map(e => e.id === target.id ? { ...e, ...optimisticPatch } : e))
    if (selected?.id === target.id) setSelected(prev => prev ? { ...prev, ...optimisticPatch } : prev)
    setLinkModalOpen(false)
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
        showToast('Email lié à l\'AO')
      } else {
        const rollback = { tender_id: previousTenderId, labels: previousLabels }
        setEmails(prev => prev.map(e => e.id === target.id ? { ...e, ...rollback } : e))
        if (selected?.id === target.id) setSelected(prev => prev ? { ...prev, ...rollback } : prev)
        showToast(`Erreur : ${data.error}`)
      }
    } catch {
      const rollback = { tender_id: previousTenderId, labels: previousLabels }
      setEmails(prev => prev.map(e => e.id === target.id ? { ...e, ...rollback } : e))
      if (selected?.id === target.id) setSelected(prev => prev ? { ...prev, ...rollback } : prev)
      showToast('Erreur liaison')
    }
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

  const handleSetPriority = (email: Email, priority: EmailPriority) => {
    const previous = email.priority
    applyEmailPatch(email.id, { priority })
    setContextMenuEmailId(null)
    void patchEmail(email.id, { priority }).catch(() => {
      applyEmailPatch(email.id, { priority: previous })
      showToast('Erreur priorité')
    })
  }

  const handleToggleLabel = (email: Email, label: EmailLabel) => {
    const previous = email.labels ?? []
    const has = previous.some(l => l.id === label.id)
    const next = has ? previous.filter(l => l.id !== label.id) : [...previous, manualLabel(label)]
    applyEmailPatch(email.id, { labels: next })
    void patchEmail(email.id, { labels: next }).catch(() => {
      applyEmailPatch(email.id, { labels: previous })
      showToast('Erreur lors de la mise à jour des étiquettes')
    })
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
    const labelsBefore = email.labels ?? []
    applyEmailPatch(email.id, { labels: applySmartLabelsToLabels(email.labels, 'moved') })
    try {
      await mailAction('move', { emailId: email.id, target })
      setEmails(prev => prev.filter(e => e.id !== email.id))
      setSelected(null)
      showToast(target === 'spam' ? 'Déplacé vers indésirables' : 'Déplacé vers corbeille')
    } catch {
      applyEmailPatch(email.id, { labels: labelsBefore })
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
      if (localFirst) void pullMailDelta()
      else loadEmails(false)
    } catch {
      showToast('Erreur vidage corbeille')
    }
  }

  const lastSyncLabel = syncUI.status === 'idle' && syncUI.lastSyncAt
    ? `Dernière synchro à ${new Date(syncUI.lastSyncAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : 'Sync non effectuée'

  const showList = !isMobile || !mobileShowDetail
  const showPanel = !isMobile || mobileShowDetail

  const filterButtons: { key: MailFilter; label: string }[] = [
    { key: 'all', label: 'Tous' },
    { key: 'unread', label: 'Non lus' },
    { key: 'attachments', label: 'PJ' },
    { key: 'ao', label: 'AO' },
  ]

  return (
    <div className="mail-page-root">
      {toast && (
        <div style={{
          position: 'fixed', bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', right: 12, left: isMobile ? 12 : 'auto', zIndex: 200,
          background: 'var(--bg-card)', border: '1px solid var(--border-hi)', borderRadius: 10,
          padding: '10px 16px', fontSize: 12, color: 'var(--text-primary)',
          fontFamily: 'DM Mono, monospace', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      {showMailWelcome && (
        <div style={{
          flexShrink: 0,
          margin: isMobile ? '8px 8px 0' : '10px 12px 0',
          padding: '12px 14px',
          background: 'rgba(59,126,246,0.1)',
          border: '1px solid rgba(59,126,246,0.28)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <p style={{ flex: 1, margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            Bienvenue dans votre messagerie 👋 Comme c&apos;est votre première visite, la synchronisation de vos mails peut prendre quelques minutes (les plus récents apparaissent en premier). Vous pouvez continuer à utiliser Operis pendant ce temps.
          </p>
          <button
            type="button"
            onClick={dismissMailWelcome}
            aria-label="Fermer"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid var(--border-hi)',
              background: 'var(--bg-card)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {!isMobile && (
        <MailToolbar
          onNewMail={() => openCompose()}
          onRefresh={handleSync}
          syncUI={syncUI}
          onRetrySync={handleSync}
          search={searchQuery}
          onSearchChange={v => { setSearchQuery(v); if (!localFirst) loadEmails(false) }}
          favoritesOnly={favoritesOnly}
          onFavoritesOnlyChange={v => { setFavoritesOnly(v); if (!localFirst) loadEmails(false) }}
        />
      )}

      <div className="mail-page-body" style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', alignItems: 'stretch' }}>
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

      {isMobile && mobileFolderSidebarOpen && (
        <>
          <button
            type="button"
            aria-label="Fermer le menu dossiers"
            onClick={() => setMobileFolderSidebarOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 120,
              background: 'rgba(0,0,0,0.45)',
              border: 'none',
              cursor: 'pointer',
            }}
          />
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: 'min(86vw, 280px)',
            zIndex: 121,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--mail-sidebar-bg, #12151c)',
            boxShadow: '4px 0 24px rgba(0,0,0,0.35)',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 12px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#e8eaef', fontFamily: 'DM Sans, system-ui' }}>
                Dossiers
              </span>
              <button
                type="button"
                onClick={() => setMobileFolderSidebarOpen(false)}
                aria-label="Fermer"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent',
                  color: '#e8eaef',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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
            </div>
          </div>
        </>
      )}

      {/* Liste emails */}
      {showList && (
        <div style={{
          width: isMobile ? '100%' : 320,
          borderRight: isMobile ? 'none' : '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)', flexShrink: 0,
          minHeight: 0,
          alignSelf: 'stretch',
        }}>
          <div style={{ padding: isMobile ? '12px 12px 10px' : '8px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {folder === 'trash' && emails.length > 0 && (
              <button type="button" onClick={() => void handleEmptyTrash()} style={{ marginBottom: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)' }}>
                Vider la corbeille
              </button>
            )}
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileFolderSidebarOpen(true)}
                aria-label="Ouvrir les dossiers"
                style={{
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-hi)',
                  background: 'var(--bg-hover)',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, system-ui',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" aria-hidden>
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </svg>
                Dossiers
              </button>
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
                {!syncing && syncUI.status === 'idle' && syncUI.lastSyncAt && (
                  <div style={{
                    fontSize: 9, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace',
                    marginTop: 4, lineHeight: 1.3, whiteSpace: 'nowrap',
                  }}>
                    {lastSyncLabel}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => {
                    setListSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')
                    if (!localFirst) void loadEmails(false)
                  }}
                  title={listSortOrder === 'desc' ? 'Tri : plus récent en premier' : 'Tri : plus ancien en premier'}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-hi)',
                    color: 'var(--text-secondary)',
                    borderRadius: 8,
                    padding: isMobile ? '8px 10px' : '5px 10px',
                    minHeight: isMobile ? 36 : undefined,
                    fontSize: 11,
                    cursor: 'pointer',
                    fontFamily: 'DM Mono, monospace',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {listSortOrder === 'desc' ? '↓ Récent' : '↑ Ancien'}
                </button>
                {isMobile && (
                  <>
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
                      <span>{syncing ? 'Synchronisation…' : 'Synchroniser'}</span>
                    </button>
                    <button onClick={() => openCompose()} style={{
                      background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7,
                      padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                    }}>+ Nouveau mail</button>
                  </>
                )}
              </div>
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
            ) : (
              <MailVirtualList
                grouped={grouped}
                scrollRef={listScrollRef}
                isMobile={isMobile}
                selectedId={selected?.id ?? null}
                onSelect={selectEmail}
                onHover={prefetchEmail}
                onContextMenu={setContextMenuEmailId}
                onNearBottom={() => {
                  if (localFirst) return
                  if (!loadingMoreRef.current && listHasMoreRef.current && !loading) {
                    void loadEmails(true, undefined, true)
                  }
                }}
                renderEmailRow={(email, isSelected) => (
                  <div
                    style={{
                      padding: isMobile ? '14px 12px' : '12px 14px',
                      borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      background: isSelected ? 'var(--bg-hover)' : 'transparent',
                      position: 'relative',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {!email.is_read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                          {email.is_starred && (
                            <span title="Favori" style={{ color: '#FFB400', fontSize: 12, flexShrink: 0, lineHeight: 1 }}>★</span>
                          )}
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
                          {(email.is_ao_related || email.is_ao) && (
                            <span style={{
                              fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '1px 5px', borderRadius: 4,
                              background: 'rgba(59,127,246,0.12)', color: '#3B7FE8',
                              border: '1px solid rgba(59,127,246,0.25)',
                            }}>
                              📋 AO détecté
                            </span>
                          )}
                          {email.ao_detection_category && email.ao_detection_category !== 'detection' && (
                            <span style={{
                              fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '1px 5px', borderRadius: 4,
                              background: `${AO_CATEGORY_BADGE[email.ao_detection_category as AoKeywordCategory]?.color ?? '#3B7FE8'}18`,
                              color: AO_CATEGORY_BADGE[email.ao_detection_category as AoKeywordCategory]?.color ?? '#3B7FE8',
                              border: `1px solid ${AO_CATEGORY_BADGE[email.ao_detection_category as AoKeywordCategory]?.color ?? '#3B7FE8'}40`,
                            }}>
                              {AO_CATEGORY_BADGE[email.ao_detection_category as AoKeywordCategory]?.emoji ?? '⚡'}
                              {AO_CATEGORY_BADGE[email.ao_detection_category as AoKeywordCategory]?.label ?? email.ao_detection_category}
                            </span>
                          )}
                          {email.tender_id && (
                            <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '1px 5px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>Lié</span>
                          )}
                          {email.has_attachments && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📎</span>
                          )}
                          {(email.labels ?? []).map(label => {
                            const badge = labelBadgeStyle(label)
                            return (
                              <span
                                key={label.id}
                                title={labelTooltip(label)}
                                style={{
                                  fontSize: 9,
                                  fontFamily: 'DM Mono, monospace',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  background: badge.background,
                                  color: badge.color,
                                  border: badge.border,
                                }}
                              >
                                {label.source === 'auto' ? '⚡ ' : ''}{label.name}
                              </span>
                            )
                          })}
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
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', padding: '4px 8px', fontFamily: 'DM Mono, monospace' }}>ACTIONS</div>
                        <button
                          type="button"
                          onClick={() => handleToggleStar(email)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '6px 8px', border: 'none', borderRadius: 6, cursor: 'pointer',
                            background: email.is_starred ? 'rgba(255,180,0,0.12)' : 'transparent',
                            color: email.is_starred ? '#FFB400' : 'var(--text-secondary)',
                            fontSize: 11, fontFamily: 'DM Sans, system-ui',
                          }}
                        >
                          {email.is_starred ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'}
                        </button>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', padding: '6px 8px 4px', fontFamily: 'DM Mono, monospace', borderTop: '1px solid var(--border)', marginTop: 4 }}>PRIORITÉ</div>
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
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', padding: '6px 8px 4px', fontFamily: 'DM Mono, monospace', borderTop: '1px solid var(--border)', marginTop: 4 }}>ÉTIQUETTES</div>
                        {PRESET_EMAIL_LABELS.map(label => {
                          const active = (email.labels ?? []).some(l => l.id === label.id)
                          return (
                            <button
                              key={label.id}
                              type="button"
                              onClick={() => handleToggleLabel(email, label)}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '6px 8px', border: 'none', borderRadius: 6, cursor: 'pointer',
                                background: active ? `${label.color}18` : 'transparent',
                                color: active ? label.color : 'var(--text-secondary)',
                                fontSize: 11, fontFamily: 'DM Sans, system-ui',
                              }}
                            >
                              {active ? '✓ ' : ''}{label.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              />
            )}
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
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', background: 'var(--bg-card)', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', alignSelf: 'stretch' }}>
          {selected ? (
            <div style={{ padding: isMobile ? '12px 14px' : '20px 24px' }}>
              {isMobile && (
                <button onClick={() => { setMobileShowDetail(false); setSelected(null) }} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                  fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans, system-ui',
                }}>← Retour</button>
              )}

              {!selected.tender_id && folder !== 'sent' && selected.mail_folder !== 'sent' && (
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
                    background: 'transparent', color: '#021246', border: '1px solid rgba(2,18,70,0.35)',
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
                  <button type="button" onClick={() => openLinkTenderModal()} style={{ background: 'transparent', color: '#021246', border: '1px solid rgba(2,18,70,0.25)', borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                    Changer d&apos;AO
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

              {(() => {
                const isSentView = folder === 'sent' || selected.mail_folder === 'sent'
                const detailIconBtn: React.CSSProperties = {
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: '1px solid var(--border-hi)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 15,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                      <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, minWidth: 0, flex: 1 }}>
                        {selected.subject || '(sans objet)'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button type="button" title="Répondre" onClick={() => openReply(selected)} style={detailIconBtn}>↩</button>
                        <button type="button" title="Transférer" onClick={() => openForward(selected)} style={detailIconBtn}>→</button>
                        {folder === 'spam' ? (
                          <button type="button" title="Pas un indésirable" onClick={() => handleNotSpam(selected)} style={{ ...detailIconBtn, color: 'var(--accent)', borderColor: 'rgba(59,126,246,0.35)' }}>✓</button>
                        ) : folder !== 'trash' && (
                          <button type="button" title="Indésirable" onClick={() => handleMoveToFolder(selected, 'spam')} style={{ ...detailIconBtn, color: '#f87171', borderColor: 'rgba(239,68,68,0.35)' }}>🚫</button>
                        )}
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                        {!isSentView && (
                          <button
                            type="button"
                            title={senderFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                            onClick={() => void toggleSenderFavorite()}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0,
                              color: senderFavorite ? '#fbbf24' : 'var(--text-muted)',
                            }}
                          >
                            {senderFavorite ? '★' : '☆'}
                          </button>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <MailAddressLines label="De" value={selected.from_address} />
                          <MailAddressLines label="À" value={selected.to_address} />
                          <MailAddressLines label="Cc" value={selected.cc_address} />
                          {isSentView && (
                            <MailAddressLines label="Cci" value={selected.bcc_address} />
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                        {selected.received_at ? new Date(selected.received_at).toLocaleString('fr-FR') : '—'}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {(['urgent', 'normal', 'info'] as EmailPriority[]).map(p => (
                          <button
                            key={p}
                            type="button"
                            title={`Priorité : ${PRIORITY_STYLES[p].label}`}
                            onClick={() => handleSetPriority(selected, p)}
                            style={{
                              padding: '3px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer',
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
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0 0 16px' }} />
                  </>
                )
              })()}

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
          contactsRef={contactsRef}
          tenderId={composeTenderId}
        />
      )}

      {linkModalOpen && modalPortalReady && createPortal(
        <div
          className="modal-overlay"
          onClick={() => setLinkModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-dialog animate-modal modal-dialog--md"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">Lier à un appel d&apos;offres</div>
              <button type="button" className="modal-close" onClick={() => setLinkModalOpen(false)} aria-label="Fermer">×</button>
            </div>
            <div className="modal-body">
            <input
              type="search"
              placeholder="Rechercher un AO…"
              value={linkTenderSearch}
              onChange={e => setLinkTenderSearch(e.target.value)}
              style={{
                width: '100%', marginBottom: 12, padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                fontSize: 13, fontFamily: 'DM Sans, system-ui', color: 'var(--text-primary)',
              }}
            />
            {tendersForLink.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun AO disponible</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tendersForLink
                  .filter(t => {
                    const q = linkTenderSearch.trim().toLowerCase()
                    if (!q) return true
                    return t.title.toLowerCase().includes(q) || t.client.toLowerCase().includes(q)
                  })
                  .map(t => (
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
        </div>,
        document.body,
      )}
    </div>
  )
}
