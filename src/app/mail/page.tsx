'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Email } from '@/types/database'
import { Spinner } from '@/components/ui'

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = await getToken()
  return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(options.headers ?? {}) } })
}

// ── Récupérer la signature depuis localStorage ─────────────────
const getSignatureData = (): { text: string; html: string } => {
  try {
    const mode = localStorage.getItem('operis_signature_mode') ?? 'fields'
    const sig = JSON.parse(localStorage.getItem('operis_signature') ?? '{}')
    
    if (mode === 'html') {
      const htmlSig = sig.html ?? ''
      const textSig = htmlSig.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      return { text: `\n\n--\n${textSig}`, html: htmlSig }
    }
    
    if (!sig.name) return { text: '', html: '' }
    
    const textSig = `${sig.name}${sig.title ? ` | ${sig.title}` : ''}${sig.company ? ` | ${sig.company}` : ''}${sig.phone ? `\n${sig.phone}` : ''}${sig.email ? ` | ${sig.email}` : ''}`
    
    const accentColor = localStorage.getItem('operis_accent') ?? '#3b7ef6'
    const htmlSig = `<table style="font-family: DM Sans, Arial, sans-serif; font-size: 13px; color: #374151;">
  <tr><td style="font-weight: 600; font-size: 14px; color: #111827; padding-bottom: 2px;">${sig.name}</td></tr>
  ${sig.title ? `<tr><td style="color: #6b7280; padding-bottom: 2px;">${sig.title}</td></tr>` : ''}
  ${sig.company ? `<tr><td style="color: #6b7280; padding-bottom: 8px;">${sig.company}</td></tr>` : ''}
  <tr><td style="border-top: 2px solid ${accentColor}; padding-top: 8px; color: #6b7280; line-height: 1.8;">
    ${sig.phone ? `📞 ${sig.phone}<br>` : ''}${sig.email ? `✉ ${sig.email}<br>` : ''}${sig.website ? `🌐 ${sig.website}` : ''}
  </td></tr>
</table>`
    
    return { text: `\n\n--\n${textSig}`, html: htmlSig }
  } catch { return { text: '', html: '' } }
}

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'transparent', border: 'none', outline: 'none',
  fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui',
}

export default function MailPage() {
  const router = useRouter()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [autoSyncStatus, setAutoSyncStatus] = useState<string | null>(null)
  const [newCount, setNewCount] = useState(0)
  const [selected, setSelected] = useState<Email | null>(null)
  const [composing, setComposing] = useState(false)
  const [compose, setCompose] = useState({ to: '', cc: '', subject: '', body: '' })
  const [attachments, setAttachments] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<'all' | 'ao' | 'unread'>('all')
  const [toast, setToast] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emailCountRef = useRef(0)
  const autoSyncRef = useRef<NodeJS.Timeout | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  const loadEmails = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter === 'ao') params.set('ao', 'true')
      if (filter === 'unread') params.set('unread', 'true')
      const res = await authFetch(`/api/mail/emails?${params}`)
      const data = await res.json()
      if (data.success) {
        const newEmails = data.data as Email[]
        if (silent && newEmails.length > emailCountRef.current) {
          const diff = newEmails.length - emailCountRef.current
          setNewCount(n => n + diff)
          showToast(`${diff} nouveau(x) email(s)`)
        }
        emailCountRef.current = newEmails.length
        setEmails(newEmails)
      }
    } catch (e) { console.error(e) }
    if (!silent) setLoading(false)
  }, [filter])

  useEffect(() => { loadEmails() }, [filter])

  // Auto-sync toutes les 5 minutes
  useEffect(() => {
    const autoSync = async () => {
      try {
        setAutoSyncStatus('sync...')
        const res = await authFetch('/api/mail/sync', { method: 'POST', body: JSON.stringify({}) })
        const data = await res.json()
        if (data.success) {
          await loadEmails(true)
          setAutoSyncStatus(`Synchro ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`)
        }
      } catch {}
    }
    autoSyncRef.current = setInterval(autoSync, 5 * 60 * 1000)
    return () => { if (autoSyncRef.current) clearInterval(autoSyncRef.current) }
  }, [loadEmails])

  // Realtime Supabase
  useEffect(() => {
    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const channel = supabase.channel('emails-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emails', filter: `user_id=eq.${session.user.id}` }, (payload) => {
          const newEmail = payload.new as Email
          setEmails(prev => [newEmail, ...prev])
          setNewCount(n => n + 1)
          emailCountRef.current += 1
          showToast(`Nouvel email : ${newEmail.subject?.slice(0, 40)}`)
        })
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }
    const cleanup = setupRealtime()
    return () => { cleanup.then(fn => fn?.()) }
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    setNewCount(0)
    try {
      const res = await authFetch('/api/mail/sync', { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      if (data.success) {
        showToast(`Synchro terminée — ${data.data.stored} nouveaux, ${data.data.aoDetected} AO`)
        setAutoSyncStatus(`Synchro ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`)
        await loadEmails()
      } else showToast(`Erreur : ${data.error}`)
    } catch (e: any) { showToast(`Erreur : ${e.message}`) }
    setSyncing(false)
  }

  const openCompose = (prefill: any = {}) => {
    const sig = getSignatureData()
    setCompose({ to: '', cc: '', subject: '', body: sig.text, ...prefill })
    setAttachments([])
    setComposing(true); setSendError(null)
  }

  const openReply = (email: Email) => {
    const sig = getSignatureData()
    const originalLines = (email.body_text ?? '').split('\n').slice(0, 5).map(l => `> ${l}`).join('\n')
    openCompose({
      to: email.from_address ?? '',
      subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: `${sig.text}\n\n--- Message original ---\n${originalLines}`,
    })
  }

  const openForward = (email: Email) => {
    const sig = getSignatureData()
    openCompose({
      subject: `Fwd: ${email.subject}`,
      body: `${sig.text}\n\n--- Message transféré ---\nDe : ${email.from_address}\nObjet : ${email.subject}\n\n${email.body_text ?? ''}`,
    })
  }

  const handleSend = async () => {
    if (!compose.to || !compose.subject || !compose.body) {
      setSendError('Destinataire, sujet et corps requis')
      return
    }
    setSending(true); setSendError(null)
    try {
      // Récupérer la signature HTML pour l'injection dans le mail
      const sig = getSignatureData()
      
      // Extraire la signature du body (si elle commence par \n\n--)
      let bodyWithoutSig = compose.body
      let signatureHtml = ''
      
      const sigIndex = compose.body.indexOf('\n\n--\n')
      if (sigIndex !== -1) {
        bodyWithoutSig = compose.body.slice(0, sigIndex)
        signatureHtml = sig.html // Utiliser le HTML de la signature
      }

      const formData = new FormData()
      formData.append('to', compose.to)
      formData.append('cc', compose.cc)
      formData.append('subject', compose.subject)
      formData.append('body', bodyWithoutSig)
      formData.append('signature', signatureHtml)
      attachments.forEach(f => formData.append('attachments', f))

      const token = await getToken()
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
        }),
      })
      const data = await res.json()
      if (data.success) {
        setComposing(false)
        showToast('Email envoyé ✓')
      } else setSendError(data.error)
    } catch (e: any) { setSendError(e.message) }
    setSending(false)
  }

  const handleMarkRead = async (email: Email) => {
    if (email.is_read) return
    try {
      await authFetch(`/api/mail/emails`, {
        method: 'PATCH',
        body: JSON.stringify({ id: email.id, is_read: true }),
      })
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e))
    } catch {}
  }

  const handleCreateAo = async () => {
    if (!selected) return
    setCreating(true)
    try {
      const res = await authFetch(`/api/mail/emails/${selected.id}/ao`, { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      if (data.success) { showToast('AO créé !'); router.push(`/tenders/${data.data.tender_id}`) }
      else showToast(`Erreur : ${data.error}`)
    } catch (e: any) { showToast(`Erreur : ${e.message}`) }
    setCreating(false)
  }

  const unreadTotal = emails.filter(e => !e.is_read).length

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 0px)', margin: '-24px -28px', overflow: 'hidden' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200, background: 'var(--bg-card)', border: '1px solid var(--border-hi)', borderRadius: 10, padding: '10px 16px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'DM Mono, monospace', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      {/* Sidebar emails */}
      <div style={{ width: 300, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        {/* Header */}
        <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Messagerie</span>
              {unreadTotal > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', fontFamily: 'DM Mono, monospace' }}>{unreadTotal}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {autoSyncStatus && <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>{autoSyncStatus}</span>}
              <button onClick={handleSync} disabled={syncing} title="Synchroniser" style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: syncing ? 'var(--text-muted)' : 'var(--text-secondary)', borderRadius: 7, padding: '5px 8px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'DM Sans, system-ui', transition: 'all 0.12s' }}>
                {syncing ? <Spinner size={11} /> : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                )}
                {syncing ? 'Sync...' : 'Sync'}
              </button>
              <button onClick={() => openCompose()} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>+ Nouveau</button>
            </div>
          </div>

          {/* Filtres */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ key: 'all', label: 'Tous' }, { key: 'unread', label: 'Non lus' }, { key: 'ao', label: 'AO' }].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key as any)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: 'none', background: filter === f.key ? 'var(--accent-soft)' : 'transparent', color: filter === f.key ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'DM Sans, system-ui' }}>{f.label}</button>
            ))}
          </div>

          {newCount > 0 && (
            <div onClick={() => { setNewCount(0); loadEmails() }} style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(59,126,246,0.1)', borderRadius: 7, fontSize: 11, color: 'var(--accent)', cursor: 'pointer', textAlign: 'center', border: '1px solid rgba(59,126,246,0.2)' }}>
              {newCount} nouveau(x) — Cliquer pour actualiser
            </div>
          )}
        </div>

        {/* Liste emails */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100 }}><Spinner /></div>
          ) : emails.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>Aucun email — lance une synchro IMAP</div>
          ) : emails.map(email => (
            <div key={email.id} onClick={() => { setSelected(email); setNewCount(0); handleMarkRead(email) }}
              style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected?.id === email.id ? 'var(--bg-hover)' : 'transparent', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (selected?.id !== email.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)' }}
              onMouseLeave={e => { if (selected?.id !== email.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                {!email.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                {email.is_ao && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />}
                <span style={{ fontSize: 12, fontWeight: email.is_read ? 400 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: email.is_read ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{email.subject}</span>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{email.from_address}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{email.received_at ? new Date(email.received_at).toLocaleDateString('fr-FR') : ''}</span>
                {email.is_ao && <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>AO</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel détail / compositeur */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-primary)' }}>
        {composing ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Nouveau message</span>
              <button onClick={() => setComposing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', gap: 8 }}>
              {[{ label: 'À', key: 'to', type: 'email' }, { label: 'Cc', key: 'cc', type: 'text' }, { label: 'Objet', key: 'subject', type: 'text' }].map(field => (
                <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', width: 32, textTransform: 'uppercase' }}>{field.label}</span>
                  <input type={field.type} value={(compose as any)[field.key]} onChange={e => setCompose(c => ({ ...c, [field.key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <textarea ref={bodyRef} value={compose.body} onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                placeholder="Écris ton message ici..."
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', resize: 'none', paddingTop: 8 }} />

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

              <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)', alignItems: 'center' }}>
                <button onClick={handleSend} disabled={sending} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: sending ? 0.5 : 1, fontFamily: 'DM Sans, system-ui', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {sending && <Spinner size={11} />}
                  {sending ? 'Envoi...' : 'Envoyer'}
                </button>
                <button onClick={() => fileInputRef.current?.click()} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '7px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans, system-ui' }}>
                  📎 Joindre
                </button>
                <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                  onChange={e => { if (e.target.files) setAttachments(a => [...a, ...Array.from(e.target.files!)]) }} />
                <button onClick={() => setComposing(false)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Annuler</button>
              </div>
            </div>
          </div>
        ) : selected ? (
          <div style={{ padding: '20px 24px' }}>
            {selected.is_ao && !selected.tender_id && (
              <div style={{ background: 'rgba(59,126,246,0.08)', border: '1px solid rgba(59,126,246,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: '#93c5fd', flex: 1 }}>AO détecté — Score {selected.ao_score}/100</span>
                <button onClick={handleCreateAo} disabled={creating} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: creating ? 0.5 : 1, fontFamily: 'DM Sans, system-ui' }}>
                  {creating ? '...' : 'Créer AO'}
                </button>
              </div>
            )}
            {selected.tender_id && (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: '#86efac', flex: 1 }}>AO déjà créé depuis cet email</span>
                <button onClick={() => router.push(`/tenders/${selected.tender_id}`)} style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
                  Voir l'AO
                </button>
              </div>
            )}
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>{selected.subject}</div>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.8 }}>
              <div>De : <span style={{ color: 'var(--text-secondary)' }}>{selected.from_address}</span></div>
              <div>Date : <span style={{ color: 'var(--text-secondary)' }}>{selected.received_at ? new Date(selected.received_at).toLocaleString('fr-FR') : '—'}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => openReply(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>↩ Répondre</button>
              <button onClick={() => openForward(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>→ Transférer</button>
            </div>
            {selected.body_html ? (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: selected.body_html }} />
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selected.body_text}</div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 12 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="40" height="40"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <span style={{ fontSize: 12 }}>Sélectionne un email ou compose un message</span>
            <button onClick={() => openCompose()} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui', marginTop: 8 }}>
              + Nouveau mail
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
