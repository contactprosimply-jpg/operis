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

const getSignature = () => {
  try {
    const mode = localStorage.getItem('operis_signature_mode') ?? 'fields'
    const sig = JSON.parse(localStorage.getItem('operis_signature') ?? '{}')
    if (mode === 'html') return sig.html ? `\n\n--\n${sig.html}` : ''
    if (!sig.name) return ''
    return `\n\n--\n${sig.name}${sig.title ? ` | ${sig.title}` : ''}${sig.company ? ` | ${sig.company}` : ''}${sig.phone ? `\n${sig.phone}` : ''}${sig.email ? ` | ${sig.email}` : ''}`
  } catch { return '' }
}

export default function MailPage() {
  const router = useRouter()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
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

  // Supabase Realtime — ecoute les nouveaux emails
  useEffect(() => {
    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const channel = supabase
        .channel('emails-realtime')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'emails',
          filter: `user_id=eq.${session.user.id}`,
        }, (payload) => {
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
        showToast(`Synchro terminee — ${data.data.stored} nouveaux, ${data.data.aoDetected} AO`)
        await loadEmails()
      } else showToast(`Erreur : ${data.error}`)
    } catch (e: any) { showToast(`Erreur : ${e.message}`) }
    setSyncing(false)
  }

  const openCompose = (prefill: any = {}) => {
    const signature = getSignature()
    setCompose({ to: '', cc: '', subject: '', body: signature, ...prefill })
    setAttachments([])
    setComposing(true); setSendError(null)
  }

  const openReply = (email: Email) => {
    const from = email.from_address ?? ''
    const emailMatch = from.match(/<(.+)>/)
    const signature = getSignature()
    openCompose({
      to: emailMatch ? emailMatch[1] : from,
      subject: `Re: ${email.subject ?? ''}`,
      body: `${signature}\n\n---\nDe : ${email.from_address}\nDate : ${email.received_at ? new Date(email.received_at).toLocaleString('fr-FR') : ''}\nObjet : ${email.subject}\n\n${email.body_text?.slice(0, 500) ?? ''}`,
    })
    setTimeout(() => bodyRef.current?.focus(), 100)
  }

  const openForward = (email: Email) => {
    const signature = getSignature()
    openCompose({
      subject: `Fwd: ${email.subject ?? ''}`,
      body: `${signature}\n\n------- Message transfere -------\nDe : ${email.from_address}\nDate : ${email.received_at ? new Date(email.received_at).toLocaleString('fr-FR') : ''}\nObjet : ${email.subject}\n\n${email.body_text?.slice(0, 1000) ?? ''}`,
    })
  }

  const handleSend = async () => {
    if (!compose.to || !compose.subject || !compose.body) { setSendError('Destinataire, sujet et corps requis'); return }
    setSending(true); setSendError(null)
    try {
      // Si pièces jointes — utiliser FormData
      if (attachments.length > 0) {
        const formData = new FormData()
        formData.append('to', compose.to)
        formData.append('cc', compose.cc)
        formData.append('subject', compose.subject)
        formData.append('body', compose.body)
        attachments.forEach(f => formData.append('attachments', f))
        const token = await getToken()
        const res = await fetch('/api/mail/send', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData })
        const data = await res.json()
        if (data.success) { showToast('Email envoye'); setComposing(false); setAttachments([]) }
        else setSendError(`Erreur : ${data.error}`)
      } else {
        const res = await authFetch('/api/mail/send', { method: 'POST', body: JSON.stringify(compose) })
        const data = await res.json()
        if (data.success) { showToast('Email envoye'); setComposing(false) }
        else setSendError(`Erreur : ${data.error}`)
      }
    } catch (e: any) { setSendError(`Erreur : ${e.message}`) }
    setSending(false)
  }

  const handleCreateAo = async () => {
    if (!selected) return
    setCreating(true)
    try {
      const res = await authFetch(`/api/mail/emails/${selected.id}/ao`, { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      if (data.success) { showToast('AO cree'); router.push(`/tenders/${data.data.tender_id}`) }
      else showToast(`Erreur : ${data.error}`)
    } catch (e: any) { showToast(`Erreur : ${e.message}`) }
    setCreating(false)
  }

  const inputStyle: React.CSSProperties = { flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200, background: 'var(--bg-card)', border: '1px solid var(--border-hi)', borderRadius: 10, padding: '10px 16px', fontSize: 12, fontFamily: 'DM Mono, monospace', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', color: 'var(--text-primary)' }}>
          {toast}
        </div>
      )}

      {/* Topbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', flex: 1 }}>
          Messagerie
          {newCount > 0 && (
            <span style={{ marginLeft: 8, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontFamily: 'DM Mono, monospace' }}>
              {newCount} nouveau(x)
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['all', 'ao', 'unread'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '4px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: 'none', background: filter === f ? 'var(--accent-soft)' : 'transparent', color: filter === f ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'DM Sans, system-ui' }}>
              {f === 'all' ? 'Tous' : f === 'ao' ? 'AO' : 'Non lus'}
            </button>
          ))}
        </div>
        <button onClick={() => router.push('/settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 7 }} title="Parametres">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>
        <button onClick={() => openCompose()} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
          + Nouveau mail
        </button>
        <button onClick={handleSync} disabled={syncing} style={{ position: 'relative', background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>
          {syncing ? '...' : 'Sync IMAP'}
        </button>
      </div>

      {/* Split */}
      <div style={{ display: 'flex', flex: 1, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', minHeight: 0 }}>
        {/* Liste */}
        <div style={{ width: 290, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-card)' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100 }}><Spinner /></div>
          ) : emails.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>Aucun email — lance une synchro IMAP</div>
          ) : emails.map(email => (
            <div key={email.id} onClick={() => { setSelected(email); setNewCount(0) }}
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

        {/* Detail */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-primary)' }}>
          {composing ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Nouveau message</span>
                <button onClick={() => setComposing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', gap: 8 }}>
                {[{ label: 'A', key: 'to', type: 'email' }, { label: 'Cc', key: 'cc', type: 'text' }, { label: 'Objet', key: 'subject', type: 'text' }].map(field => (
                  <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', width: 32, textTransform: 'uppercase' }}>{field.label}</span>
                    <input type={field.type} value={(compose as any)[field.key]} onChange={e => setCompose(c => ({ ...c, [field.key]: e.target.value }))} style={inputStyle} />
                  </div>
                ))}
                <textarea ref={bodyRef} value={compose.body} onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                  placeholder="Ecris ton message ici..."
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', resize: 'none', paddingTop: 8 }} />

                {/* Pieces jointes */}
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {attachments.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text-secondary)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                        {f.name}
                        <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 14, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {sendError && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,0.1)', borderRadius: 7, padding: '8px 12px' }}>{sendError}</div>}

                <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)', alignItems: 'center' }}>
                  <button onClick={handleSend} disabled={sending} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: sending ? 0.5 : 1, fontFamily: 'DM Sans, system-ui' }}>
                    {sending ? 'Envoi...' : 'Envoyer'}
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '7px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'DM Sans, system-ui' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                    Joindre
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
                  <span style={{ fontSize: 12, color: '#93c5fd', flex: 1 }}>AO detecte — Score {selected.ao_score}/100</span>
                  <button onClick={handleCreateAo} disabled={creating} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: creating ? 0.5 : 1, fontFamily: 'DM Sans, system-ui' }}>
                    {creating ? '...' : 'Creer AO'}
                  </button>
                </div>
              )}
              {selected.tender_id && (
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: '#86efac', flex: 1 }}>AO deja cree depuis cet email</span>
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
                <button onClick={() => openReply(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Repondre</button>
                <button onClick={() => openForward(selected)} style={{ background: 'transparent', border: '1px solid var(--border-hi)', color: 'var(--text-secondary)', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Transferer</button>
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
              <span style={{ fontSize: 12 }}>Selectionne un email ou compose un message</span>
              <button onClick={() => openCompose()} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui', marginTop: 8 }}>
                + Nouveau mail
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
