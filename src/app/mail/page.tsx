'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authFetch, getAccessToken } from '@/lib/auth-client'
import { useAuth } from '@/components/AuthProvider'
import { Email, EmailAttachment } from '@/types/database'
import { Spinner } from '@/components/ui'
import { getSignatureData, stripSignatureFromBody } from '@/lib/email-signature'
import { groupEmailsByDate } from '@/lib/mail-grouping'

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'transparent', border: 'none', outline: 'none',
  fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui',
}

type MailFilter = 'all' | 'unread' | 'ao' | 'attachments'

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
  const [filter, setFilter] = useState<MailFilter>('all')
  const [toast, setToast] = useState<string | null>(null)
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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const loadEmails = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const safetyTimer = setTimeout(() => { if (!silent) setLoading(false) }, 12000)
    try {
      const params = new URLSearchParams({ limit: '250' })
      if (filter === 'ao') params.set('ao', 'true')
      if (filter === 'unread') params.set('unread', 'true')
      if (filter === 'attachments') params.set('attachments', 'true')
      const res = await authFetch(`/api/mail/emails?${params}`)
      const data = await res.json()
      if (data.success) {
        const newEmails = data.data as Email[]
        if (silent && newEmails.length > emailCountRef.current) {
          const diff = newEmails.length - emailCountRef.current
          if (diff > 0) showToast(`${diff} nouveau(x) email(s)`)
        }
        emailCountRef.current = newEmails.length
        setEmails(newEmails)
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
  }, [filter])

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
        const tenderId = full.tender_id ?? full.quote_analysis?.tender_id ?? null
        const merged = { ...full, tender_id: tenderId }
        setSelected(merged)
        setEmails(prev => prev.map(e => e.id === full.id ? {
          ...e,
          has_attachments: full.has_attachments,
          attachments: full.attachments,
          tender_id: tenderId ?? e.tender_id,
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
        const { stored = 0, updated = 0, quickStored = 0 } = data.data ?? {}
        const total = stored + updated
        if (!silent && total === 0) {
          showToast('Boîte à jour')
        } else if (total > 0) {
          showToast(`${total} email(s) synchronisé(s)`)
        } else if (!silent && quickStored > 0) {
          showToast(`${quickStored} nouveau(x) email(s)`)
        }
        setAutoSyncStatus(`Sync ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`)
        if (stored > 0 || updated > 0 || quickStored > 0) {
          await loadEmails(true)
          const sid = selectedIdRef.current
          if (sid && updated > 0) await loadEmailDetail(sid, true)
        }
      } else {
        const err = data.error ?? 'Synchronisation impossible'
        if (!silent) {
          if (err.includes('compte mail')) {
            showToast('Configurez votre messagerie dans Paramètres')
          } else {
            showToast(`Erreur : ${err}`)
          }
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
  }, [filter, ready, userId, loadEmails])

  useEffect(() => {
    if (!ready || !userId || initialSyncDoneRef.current) return
    initialSyncDoneRef.current = true
    void runSync(true)
  }, [ready, userId, runSync])

  // Sync en arrière-plan toutes les 25s si visible
  useEffect(() => {
    if (!ready || !userId) return
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') runSync(true)
    }, 25 * 1000)
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

  const openCompose = (prefill: Partial<typeof compose> = {}) => {
    setCompose({ to: '', cc: '', subject: '', body: '', ...prefill })
    setAttachments([])
    setComposing(true)
    setSendError(null)
    if (isMobile) setMobileShowDetail(true)
  }

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
        setComposing(false)
        if (isMobile) setMobileShowDetail(false)
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
      router.push(`/tenders/${target.tender_id}`)
      return
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

  const unreadTotal = emails.filter(e => !e.is_read).length
  const grouped = groupEmailsByDate(emails)

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

      {/* Liste emails */}
      {showList && (
        <div style={{
          width: isMobile ? '100%' : 320,
          borderRight: isMobile ? 'none' : '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)', flexShrink: 0,
        }}>
          <div style={{ padding: isMobile ? '12px 12px 10px' : '16px 14px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: isMobile ? 15 : 14, fontWeight: 600, color: 'var(--text-primary)' }}>Messagerie</span>
                {unreadTotal > 0 && (
                  <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', fontFamily: 'DM Mono, monospace' }}>{unreadTotal}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {autoSyncStatus && !isMobile && (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>{autoSyncStatus}</span>
                )}
                <button
                  type="button"
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

            {isMobile && autoSyncStatus && (
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', marginBottom: 8 }}>
                Auto-sync · {autoSyncStatus}
              </div>
            )}

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {filterButtons.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: 'none',
                  background: filter === f.key ? 'var(--accent-soft)' : 'transparent',
                  color: filter === f.key ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'DM Sans, system-ui',
                }}>{f.label}</button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {!ready || (loading && emails.length === 0) ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100 }}><Spinner /></div>
            ) : emails.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {syncing ? 'Synchronisation en cours…' : 'Aucun email pour ce filtre'}
                </div>
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
                    style={{
                      padding: isMobile ? '14px 12px' : '12px 14px',
                      borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      background: selected?.id === email.id ? 'var(--bg-hover)' : 'transparent',
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {email.is_ao && (
                            <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>AO</span>
                          )}
                          {email.tender_id && (
                            <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '1px 5px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>Lié</span>
                          )}
                          {email.has_attachments && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📎</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                          {formatMailTime(email.received_at)}
                        </span>
                        <button
                          type="button"
                          title={email.tender_id ? 'Voir l\'AO' : 'Créer un appel d\'offres'}
                          disabled={creatingAoId === email.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (email.tender_id) router.push(`/tenders/${email.tender_id}`)
                            else handleCreateAo(email)
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
                          {creatingAoId === email.id ? '…' : 'AO'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panel détail / compositeur */}
      {showPanel && (
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-primary)', WebkitOverflowScrolling: 'touch' }}>
          {composing ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '12px 14px' : '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {isMobile && (
                  <button onClick={() => { setComposing(false); setMobileShowDetail(false) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginRight: 8 }}>←</button>
                )}
                <span style={{ fontSize: 13, fontWeight: 600 }}>Nouveau message</span>
                <button onClick={() => { setComposing(false); if (isMobile) setMobileShowDetail(false) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isMobile ? '12px 14px' : '16px 20px', gap: 8, overflowY: 'auto' }}>
                {[
                  { label: 'À', key: 'to', type: 'email', placeholder: 'email@exemple.com' },
                  { label: 'Cc', key: 'cc', type: 'text', placeholder: 'copie à (virgules pour plusieurs)' },
                  { label: 'Objet', key: 'subject', type: 'text', placeholder: '' },
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', width: 32, textTransform: 'uppercase' }}>{field.label}</span>
                    <input
                      type={field.type}
                      value={(compose as Record<string, string>)[field.key]}
                      onChange={e => setCompose(c => ({ ...c, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      style={inputStyle}
                    />
                  </div>
                ))}
                <div style={{
                  flex: 1, minHeight: 140, display: 'flex', flexDirection: 'column',
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
                }}>
                  <textarea ref={bodyRef} value={compose.body} onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                    placeholder="Écris ton message ici..."
                    style={{
                      flex: 1, minHeight: 100, background: 'transparent', border: 'none', outline: 'none',
                      fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui',
                      resize: 'none', padding: '14px 16px',
                    }} />
                  {signaturePreview.html && (
                    <div style={{ padding: '0 12px 12px', flexShrink: 0 }}>
                      <SignaturePreview html={signaturePreview.html} />
                    </div>
                  )}
                </div>

                {attachments.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {attachments.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text-secondary)' }}>
                        📎 {f.name}
                        <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 14, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {sendError && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,0.1)', borderRadius: 7, padding: '8px 12px' }}>{sendError}</div>}

                <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={handleSend} disabled={sending} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: sending ? 0.5 : 1, fontFamily: 'DM Sans, system-ui', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {sending && <Spinner size={11} />}
                    {sending ? 'Envoi...' : 'Envoyer'}
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '7px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                    📎 Joindre
                  </button>
                  <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                    onChange={e => { if (e.target.files) setAttachments(a => [...a, ...Array.from(e.target.files!)]) }} />
                  <button onClick={() => { setComposing(false); if (isMobile) setMobileShowDetail(false) }} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Annuler</button>
                </div>
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
                    {selected.is_ao ? `AO détecté — Score ${selected.ao_score}/100` : 'Pas détecté comme AO'}
                  </span>
                  {!selected.is_ao && (
                    <button type="button" onClick={() => handleMarkAsAo(selected)} style={{
                      background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-hi)',
                      borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                    }}>Marquer AO</button>
                  )}
                  <button type="button" onClick={() => handleCreateAo()} disabled={creating} style={{
                    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7,
                    padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    opacity: creating ? 0.5 : 1, fontFamily: 'DM Sans, system-ui',
                  }}>
                    {creating ? '...' : 'Créer AO'}
                  </button>
                </div>
              )}
              {selected.tender_id && (
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#86efac', flex: 1 }}>
                    AO lié
                    {(selected as Email & { quote_analysis?: { price_ht: number | null } }).quote_analysis?.price_ht
                      ? ` — ${Number((selected as Email & { quote_analysis?: { price_ht: number | null } }).quote_analysis!.price_ht).toLocaleString('fr-FR')} € HT détecté`
                      : ''}
                  </span>
                  <button onClick={() => router.push(`/tenders/${selected.tender_id}`)} style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                    Voir l'AO
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

              <div style={{ display: 'flex', gap: 8, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <button onClick={() => openReply(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>↩ Répondre</button>
                <button onClick={() => openForward(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>→ Transférer</button>
                {selected.is_read ? (
                  <button onClick={() => handleMarkUnread(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Marquer non lu</button>
                ) : (
                  <button onClick={() => handleMarkRead(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Marquer lu</button>
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
    </div>
  )
}
