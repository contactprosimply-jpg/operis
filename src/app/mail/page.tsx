'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Email } from '@/types/database'

interface ComposeData {
  to: string
  cc: string
  subject: string
  body: string
}

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = await getToken()
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })
}

export default function MailPage() {
  const router = useRouter()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Email | null>(null)
  const [composing, setComposing] = useState(false)
  const [compose, setCompose] = useState<ComposeData>({ to: '', cc: '', subject: '', body: '' })
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<'all' | 'ao' | 'unread'>('all')
  const [toast, setToast] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const loadEmails = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter === 'ao') params.set('ao', 'true')
      if (filter === 'unread') params.set('unread', 'true')
      const res = await authFetch(`/api/mail/emails?${params}`)
      const data = await res.json()
      if (data.success) setEmails(data.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { loadEmails() }, [filter])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await authFetch('/api/mail/sync', { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      if (data.success) {
        showToast(`Synchro terminée — ${data.data.aoDetected} AO détectés`)
        await loadEmails()
      } else {
        showToast(`Erreur : ${data.error}`)
      }
    } catch (e: any) { showToast(`Erreur : ${e.message}`) }
    setSyncing(false)
  }

  const openCompose = () => {
    setCompose({ to: '', cc: '', subject: '', body: '' })
    setComposing(true)
    setSendResult(null)
  }

  const openReply = (email: Email) => {
    const from = email.from_address ?? ''
    const emailMatch = from.match(/<(.+)>/)
    const replyTo = emailMatch ? emailMatch[1] : from
    setCompose({
      to: replyTo,
      cc: '',
      subject: `Re: ${email.subject ?? ''}`,
      body: `\n\n---\nDe : ${email.from_address}\nDate : ${email.received_at ? new Date(email.received_at).toLocaleString('fr-FR') : ''}\nObjet : ${email.subject}\n\n${email.body_text?.slice(0, 500) ?? ''}`,
    })
    setComposing(true)
    setSendResult(null)
    setTimeout(() => bodyRef.current?.focus(), 100)
  }

  const openForward = (email: Email) => {
    setCompose({
      to: '',
      cc: '',
      subject: `Fwd: ${email.subject ?? ''}`,
      body: `\n\n------- Message transféré -------\nDe : ${email.from_address}\nDate : ${email.received_at ? new Date(email.received_at).toLocaleString('fr-FR') : ''}\nObjet : ${email.subject}\n\n${email.body_text?.slice(0, 1000) ?? ''}`,
    })
    setComposing(true)
    setSendResult(null)
  }

  const handleSend = async () => {
    if (!compose.to || !compose.subject || !compose.body) {
      setSendResult('Destinataire, sujet et corps requis')
      return
    }
    setSending(true)
    setSendResult(null)
    try {
      const res = await authFetch('/api/mail/send', {
        method: 'POST',
        body: JSON.stringify({ to: compose.to, cc: compose.cc || undefined, subject: compose.subject, body: compose.body }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('Email envoyé ✓')
        setComposing(false)
        setCompose({ to: '', cc: '', subject: '', body: '' })
      } else {
        setSendResult(`Erreur : ${data.error}`)
      }
    } catch (e: any) { setSendResult(`Erreur : ${e.message}`) }
    setSending(false)
  }

  const handleCreateAo = async () => {
    if (!selected) return
    setCreating(true)
    try {
      const res = await authFetch(`/api/mail/emails/${selected.id}/ao`, { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      if (data.success) {
        showToast('AO créé ✓')
        router.push(`/tenders/${data.data.tender_id}`)
      } else {
        showToast(`Erreur : ${data.error}`)
      }
    } catch (e: any) { showToast(`Erreur : ${e.message}`) }
    setCreating(false)
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-[#0a1f6e] border border-blue-500 rounded-lg px-4 py-2.5 text-xs text-blue-300 font-mono">
          {toast}
        </div>
      )}

      {/* TOPBAR */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest flex-1">Boîte mail</span>

        <div className="flex gap-1">
          {(['all', 'ao', 'unread'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[10px] font-mono px-3 py-1 rounded-md transition-all ${filter === f ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
              {f === 'all' ? 'Tous' : f === 'ao' ? 'AO' : 'Non lus'}
            </button>
          ))}
        </div>

        <button onClick={() => router.push('/settings')}
          className="text-slate-500 hover:text-slate-300 p-1.5 rounded-md hover:bg-white/5 transition-colors" title="Config IMAP">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>

        <button onClick={openCompose}
          className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nouveau mail
        </button>

        <button onClick={handleSync} disabled={syncing}
          className="text-slate-400 hover:text-white border border-white/10 hover:bg-white/5 text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-50">
          {syncing ? '...' : '⟳ Sync'}
        </button>
      </div>

      {/* SPLIT */}
      <div className="flex flex-1 border border-white/10 rounded-lg overflow-hidden min-h-0">

        {/* LISTE */}
        <div className="w-[280px] flex-shrink-0 border-r border-white/10 overflow-y-auto bg-[#021246]/80">
          {loading ? (
            <div className="text-xs text-slate-500 text-center py-10">Chargement...</div>
          ) : emails.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-10 px-4">Aucun email</div>
          ) : emails.map(email => (
            <div key={email.id} onClick={() => setSelected(email)}
              className={`px-4 py-3 border-b border-white/5 cursor-pointer transition-colors ${selected?.id === email.id ? 'bg-white/5' : 'hover:bg-white/3'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {!email.is_read && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
                {email.is_ao && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                <div className={`text-xs truncate ${!email.is_read ? 'text-white font-semibold' : 'text-slate-400'}`}>{email.subject}</div>
              </div>
              <div className="font-mono text-[10px] text-slate-500 truncate mb-1">{email.from_address}</div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-[9px] text-slate-600">{email.received_at ? new Date(email.received_at).toLocaleDateString('fr-FR') : ''}</span>
                {email.is_ao && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">AO</span>}
                {email.tender_id && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Lié</span>}
              </div>
            </div>
          ))}
        </div>

        {/* DETAIL / COMPOSITEUR */}
        <div className="flex-1 overflow-y-auto">
          {composing ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 flex-shrink-0">
                <span className="text-sm font-bold">Nouveau message</span>
                <button onClick={() => setComposing(false)} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
              </div>
              <div className="flex-1 flex flex-col p-5 gap-2">
                <div className="flex items-center gap-3 border-b border-white/10 pb-2">
                  <span className="font-mono text-[10px] text-slate-500 uppercase w-8">À</span>
                  <input type="email" value={compose.to} onChange={e => setCompose(c => ({ ...c, to: e.target.value }))}
                    placeholder="destinataire@email.com"
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
                </div>
                <div className="flex items-center gap-3 border-b border-white/10 pb-2">
                  <span className="font-mono text-[10px] text-slate-500 uppercase w-8">Cc</span>
                  <input type="text" value={compose.cc} onChange={e => setCompose(c => ({ ...c, cc: e.target.value }))}
                    placeholder="copie@email.com"
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
                </div>
                <div className="flex items-center gap-3 border-b border-white/10 pb-2">
                  <span className="font-mono text-[10px] text-slate-500 uppercase w-8">Objet</span>
                  <input type="text" value={compose.subject} onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))}
                    placeholder="Objet du message"
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
                </div>
                <textarea ref={bodyRef} value={compose.body} onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                  placeholder="Écris ton message ici..."
                  className="flex-1 bg-transparent text-sm text-white outline-none resize-none placeholder:text-slate-600 min-h-[200px] pt-3" />
                {sendResult && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-xs text-red-400">{sendResult}</div>
                )}
                <div className="flex gap-2 pt-2 border-t border-white/10">
                  <button onClick={handleSend} disabled={sending}
                    className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-md transition-colors flex items-center gap-2">
                    {sending ? 'Envoi...' : '→ Envoyer'}
                  </button>
                  <button onClick={() => setComposing(false)}
                    className="text-slate-400 hover:text-white text-xs px-4 py-2 rounded-md border border-white/10 hover:bg-white/5 transition-colors">
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          ) : selected ? (
            <div className="p-6">
              {selected.is_ao && !selected.tender_id && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
                  <span className="text-xs text-blue-300 flex-1">AO détecté — Score {selected.ao_score}/100</span>
                  <button onClick={handleCreateAo} disabled={creating}
                    className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-50">
                    {creating ? 'Création...' : 'Créer AO →'}
                  </button>
                </div>
              )}
              {selected.tender_id && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
                  <span className="text-xs text-emerald-300 flex-1">AO déjà créé depuis cet email</span>
                  <button onClick={() => router.push(`/tenders/${selected.tender_id}`)}
                    className="bg-emerald-500/20 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-md border border-emerald-500/30">
                    Voir l'AO →
                  </button>
                </div>
              )}
              <div className="text-base font-bold mb-3">{selected.subject}</div>
              <div className="font-mono text-xs text-slate-500 mb-5 leading-loose">
                <div>De : <span className="text-slate-400">{selected.from_address}</span></div>
                <div>Date : <span className="text-slate-400">{selected.received_at ? new Date(selected.received_at).toLocaleString('fr-FR') : '—'}</span></div>
              </div>
              <div className="flex gap-2 mb-5 pb-4 border-b border-white/10">
                <button onClick={() => openReply(selected)}
                  className="text-slate-400 hover:text-white border border-white/10 hover:bg-white/5 text-xs px-3 py-1.5 rounded-md transition-colors">
                  ↩ Répondre
                </button>
                <button onClick={() => openForward(selected)}
                  className="text-slate-400 hover:text-white border border-white/10 hover:bg-white/5 text-xs px-3 py-1.5 rounded-md transition-colors">
                  → Transférer
                </button>
              </div>
              <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{selected.body_text}</div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="40" height="40">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <span className="text-xs">Sélectionne un email ou compose un nouveau message</span>
              <button onClick={openCompose}
                className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-md mt-2">
                + Nouveau mail
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}