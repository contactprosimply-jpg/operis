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
import MailComposePanel from '@/components/mail/MailComposePanel'
import {
  filterEmailsForFolder,
  type MailFolder,
  type SentMailRow,
  SPAM_LABEL,
  TRASH_LABEL,
} from '@/lib/mail-folders'
import {
  loadDrafts,
  upsertDraft,
  removeDraft,
  newDraftId,
  type MailDraft,
} from '@/lib/mail-drafts'

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
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [autoSyncStatus, setAutoSyncStatus] = useState<string | null>(null)
  const [selected, setSelected] = useState<Email | null>(null)
  const [composing, setComposing] = useState(false)
  const [compose, setCompose] = useState({ to: '', cc: '', subject: '', body: '' })
  const [attachments, setAttachments] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [creatingAoId, setCreatingAoId] = useState<string | null>(null)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [tendersForLink, setTendersForLink] = useState<Array<{ id: string; title: string; client: string }>>([])
  const [linkingTender, setLinkingTender] = useState(false)
  const [folder, setFolder] = useState<MailFolder>('inbox')
  const [allEmails, setAllEmails] = useState<Email[]>([])
  const [sentMails, setSentMails] = useState<SentMailRow[]>([])
  const [drafts, setDrafts] = useState<MailDraft[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [selectedSent, setSelectedSent] = useState<SentMailRow | null>(null)
  const [mailAccountEmail, setMailAccountEmail] = useState<string | null>(null)
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
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emailCountRef = useRef(0)
  const selectedIdRef = useRef<string | null>(null)
  const syncInProgressRef = useRef(false)
  const syncAbortRef = useRef<AbortController | null>(null)
  const initialSyncDoneRef = useRef(false)
  const emailsRef = useRef<Email[]>([])
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
  }, [ready, userId, session?.user?.email])

  const loadSentMails = useCallback(async () => {
    try {
      const res = await authFetch('/api/mail/sent?limit=100')
      const data = await res.json()
      if (data.success) setSentMails(data.data ?? [])
    } catch { /* ignore */ }
  }, [])

  const handleFolderChange = (f: MailFolder) => {
    setFolder(f)
    setSelected(null)
    setSelectedSent(null)
    setComposing(false)
    if (isMobile) setMobileShowDetail(false)
    if (f === 'sent') loadSentMails()
    if (f === 'drafts' && userId) setDrafts(loadDrafts(userId))
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

  const loadEmails = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const safetyTimer = setTimeout(() => { if (!silent) setLoading(false) }, 12000)
    try {
      const params = new URLSearchParams({ limit: '250' })
      const listFilter = folder === 'inbox' ? filter : 'all'
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
        if (silent && newEmails.length > emailCountRef.current) {
          const diff = newEmails.length - emailCountRef.current
          if (diff > 0) showToast(`${diff} nouveau(x) email(s)`)
        }
        emailCountRef.current = newEmails.length
        setAllEmails(newEmails)
        setEmails(filterEmailsForFolder(newEmails, folder))
        const sid = selectedIdRef.current
        if (sid) {
          const updated = newEmails.find(e => e.id === sid)
          if (updated) setSelected(prev => prev ? { ...prev, ...updated } : updated)
        }
      }
    } catch (e) { console.error(e) }
    finally {
      clearTimeout(safetyTimer)
      if (!silent) setLoading(false)
    }
  }, [filter, priorityFilter, fromFilter, tenderFilter, labelFilter, sinceFilter, untilFilter, folder])

  useEffect(() => {
    setEmails(filterEmailsForFolder(allEmails, folder))
  }, [folder, allEmails])

  const loadEmailDetail = useCallback(async (emailId: string, silent = false) => {
    if (!silent) setLoadingDetail(true)
    const safetyTimer = setTimeout(() => { if (!silent) setLoadingDetail(false) }, 60000)
    try {
      const res = await authFetch(`/api/mail/emails/${emailId}`)
      const data = await res.json()
      if (data.success) {
        const full = data.data as Email & {
          quote_analysis?: {
            price_ht: number | null
            tender_id: string | null
            enriched: boolean
            supplier_missing?: boolean
          }
        }
        const merged = { ...full, tender_id: full.tender_id ?? null }
        setSelected(merged)
        setEmails(prev => prev.map(e => e.id === full.id ? {
          ...e,
          has_attachments: full.has_attachments,
          attachments: full.attachments,
          tender_id: merged.tender_id ?? e.tender_id,
        } : e))
        if (!silent && full.quote_analysis?.price_ht) {
          showToast(`Prix détecté : ${Number(full.quote_analysis.price_ht).toLocaleString('fr-FR')} € HT`)
        } else if (!silent && full.quote_analysis?.supplier_missing) {
          showToast('Fournisseur non reconnu — vérifiez l\'email du fournisseur dans Operis')
        } else if (!silent && full.quote_analysis?.enriched) {
          showToast('Email et pièces jointes importés')
        } else if (!silent && full.has_attachments && !full.quote_analysis?.price_ht) {
          showToast('Prix non trouvé dans le PDF — saisie manuelle sur l\'AO')
        }
      }
    } catch (e) { console.error(e) }
    finally {
      clearTimeout(safetyTimer)
      if (!silent) setLoadingDetail(false)
    }
  }, [])

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
          setAutoSyncStatus(`Synchro : ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`)
        }
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
  }, [loadEmails, loadEmailDetail])

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
          body_text: raw.body_text ?? null, body_html: raw.body_html ?? null,
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

  const selectEmail = (email: Email) => {
    setSelected(email)
    setComposing(false)
    if (isMobile) setMobileShowDetail(true)
    loadEmailDetail(email.id)
    if (!email.is_read) handleMarkRead(email)
  }

  useEffect(() => {
    if (!pendingEmailId || emails.length === 0) return
    const target = emails.find(e => e.id === pendingEmailId)
    if (target && selected?.id !== target.id) selectEmail(target)
  }, [pendingEmailId, emails, selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const openCompose = (prefill: Partial<typeof compose> = {}, draftId?: string) => {
    setCompose({ to: '', cc: '', subject: '', body: '', ...prefill })
    setAttachments([])
    setActiveDraftId(draftId ?? newDraftId())
    setComposing(true)
    setSendError(null)
    setSelected(null)
    setSelectedSent(null)
    if (isMobile) setMobileShowDetail(true)
  }

  useEffect(() => {
    if (!composing || !userId || !activeDraftId) return
    const t = setTimeout(() => {
      upsertDraft(userId, {
        id: activeDraftId,
        to: compose.to,
        cc: compose.cc,
        subject: compose.subject,
        body: compose.body,
        updatedAt: new Date().toISOString(),
      })
      if (folder === 'drafts') setDrafts(loadDrafts(userId))
    }, 800)
    return () => clearTimeout(t)
  }, [composing, compose, activeDraftId, userId, folder])

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
    const bodyWithoutSig = stripSignatureFromBody(compose.body, sig.text)
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
        setComposing(false)
        if (isMobile) setMobileShowDetail(false)
        loadSentMails()
        showToast('Email envoyé ✓')
      } else setSendError(data.error)
    } catch (e: any) { setSendError(e.message) }
    setSending(false)
  }

  const handleMarkRead = async (email: Email) => {
    if (email.is_read) return
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e))
    setSelected(prev => prev?.id === email.id ? { ...prev, is_read: true } : prev)
    try {
      await authFetch('/api/mail/emails', {
        method: 'PATCH',
        body: JSON.stringify({ id: email.id, is_read: true }),
      })
    } catch {
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: false } : e))
      setSelected(prev => prev?.id === email.id ? { ...prev, is_read: false } : prev)
    }
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

  const inboxEmails = filterEmailsForFolder(allEmails, 'inbox')
  const unreadTotal = inboxEmails.filter(e => !e.is_read).length
  const grouped = groupEmailsByDate(emails)
  const folderBadges: Partial<Record<MailFolder, number>> = {
    inbox: unreadTotal,
    drafts: drafts.length,
  }

  const handleMoveToFolder = async (email: Email, target: 'spam' | 'trash') => {
    const label = target === 'spam' ? SPAM_LABEL : TRASH_LABEL
    const current = email.labels ?? []
    const without = current.filter(l => l.id !== SPAM_LABEL.id && l.id !== TRASH_LABEL.id)
    const next = [...without, label]
    try {
      await patchEmail(email.id, { labels: next })
      applyEmailPatch(email.id, { labels: next })
      setAllEmails(prev => prev.map(e => e.id === email.id ? { ...e, labels: next } : e))
      showToast(target === 'spam' ? 'Déplacé vers indésirables' : 'Déplacé vers corbeille')
    } catch {
      showToast('Erreur déplacement')
    }
  }

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
        <MailFolderSidebar
          accountEmail={mailAccountEmail}
          folder={folder}
          onFolderChange={handleFolderChange}
          onCompose={() => openCompose()}
          onSync={handleSync}
          syncing={syncing}
          badges={folderBadges}
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
          <div style={{ padding: isMobile ? '12px 12px 10px' : '16px 14px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {isMobile && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                {(['inbox', 'drafts', 'sent', 'spam', 'trash'] as MailFolder[]).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleFolderChange(f)}
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
                    padding: isMobile ? '8px 12px' : '6px 10px',
                    minHeight: 36,
                    minWidth: isMobile ? 44 : undefined,
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
                  <span>Sync</span>
                </button>
                <button onClick={() => openCompose()} style={{
                  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7,
                  padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                }}>+ Nouveau</button>
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

          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {folder === 'sent' ? (
              sentMails.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: 'var(--text-muted)' }}>
                  Aucun message envoyé depuis Operis
                </div>
              ) : sentMails.map(row => (
                <div
                  key={row.id}
                  onClick={() => {
                    setSelectedSent(row)
                    setSelected(null)
                    setComposing(false)
                    if (isMobile) setMobileShowDetail(true)
                  }}
                  style={{
                    padding: isMobile ? '14px 12px' : '12px 14px',
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    background: selectedSent?.id === row.id ? 'var(--bg-hover)' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    À : {row.to_address}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{row.subject ?? '(sans objet)'}</div>
                  <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                    {formatMailTime(row.sent_at)}
                  </div>
                </div>
              ))
            ) : folder === 'drafts' ? (
              drafts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: 'var(--text-muted)' }}>
                  Aucun brouillon — cliquez sur « Nouveau message »
                </div>
              ) : drafts.map(draft => (
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
              ))
            ) : !ready || (loading && emails.length === 0) ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100 }}><Spinner /></div>
            ) : emails.length === 0 ? (
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
                            {email.from_address?.split('<')[0].trim() || email.from_address}
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
          </div>
        </div>
      )}

      {/* Panel détail / compositeur */}
      {showPanel && (
        <div style={{ flex: 1, overflow: composing ? 'hidden' : 'auto', background: 'var(--bg-primary)', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {composing ? (
            <MailComposePanel
              isMobile={isMobile}
              compose={compose}
              onChange={patch => setCompose(c => ({ ...c, ...patch }))}
              onSend={handleSend}
              onCancel={() => {
                setComposing(false)
                if (isMobile) setMobileShowDetail(false)
              }}
              onAttach={() => fileInputRef.current?.click()}
              attachments={attachments}
              onRemoveAttachment={i => setAttachments(a => a.filter((_, j) => j !== i))}
              sending={sending}
              sendError={sendError}
              isListening={isListening}
              onToggleSpeech={toggleSpeech}
              bodyRef={bodyRef}
              fileInputRef={fileInputRef}
              onFilesSelected={files => setAttachments(a => [...a, ...Array.from(files)])}
              signaturePreview={signaturePreview}
              SignaturePreview={SignaturePreview}
            />
          ) : selectedSent ? (
            <div style={{ padding: isMobile ? '12px 14px' : '20px 24px' }}>
              {isMobile && (
                <button onClick={() => { setMobileShowDetail(false); setSelectedSent(null) }} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                  fontSize: 13, marginBottom: 12, fontFamily: 'DM Sans, system-ui',
                }}>← Retour</button>
              )}
              <div style={{ fontSize: isMobile ? 16 : 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
                {selectedSent.subject ?? '(sans objet)'}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.8 }}>
                <div>À : <span style={{ color: 'var(--text-secondary)' }}>{selectedSent.to_address}</span></div>
                <div>Date : <span style={{ color: 'var(--text-secondary)' }}>{new Date(selectedSent.sent_at).toLocaleString('fr-FR')}</span></div>
              </div>
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-hi)', borderRadius: 10,
                padding: '16px 18px', fontSize: 14, lineHeight: 1.65, color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap', fontFamily: 'DM Sans, system-ui',
              }}>
                {selectedSent.body ?? ''}
              </div>
            </div>
          ) : selected ? (
            <div style={{ padding: isMobile ? '12px 14px' : '20px 24px' }}>
              {loadingDetail && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                  <Spinner size={12} /> Chargement du message…
                </div>
              )}
              {isMobile && (
                <button onClick={() => { setMobileShowDetail(false); setSelected(null) }} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                  fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans, system-ui',
                }}>← Retour</button>
              )}

              {!selected.tender_id && (
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
              {loadingDetail && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Analyse de l&apos;email et des pièces jointes…
                </div>
              )}
              {(selected as Email & { quote_analysis?: { supplier_missing?: boolean; price_ht?: number | null } }).quote_analysis?.supplier_missing && (
                <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 12, color: '#fbbf24' }}>
                  Fournisseur non reconnu ({selected.from_address}). Mettez cette adresse (ou le même domaine) sur le fournisseur consulté.
                </div>
              )}

              <div style={{ fontSize: isMobile ? 16 : 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{selected.subject}</div>
              <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.8 }}>
                <div>De : <span style={{ color: 'var(--text-secondary)' }}>{selected.from_address}</span></div>
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
                <button type="button" onClick={() => handleMoveToFolder(selected, 'spam')} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Indésirable</button>
                <button type="button" onClick={() => handleMoveToFolder(selected, 'trash')} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-muted)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Corbeille</button>
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
              {selected.has_attachments && !(selected.attachments?.length) && !loadingDetail && (
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

              {selected.body_html ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: '100%', overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: selected.body_html }} />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selected.body_text}</div>
              )}
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
