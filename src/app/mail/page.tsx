'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Badge, Spinner, useToast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Email } from '@/types/database'

export default function MailPage() {
  const router = useRouter()
  const { show, ToastComponent } = useToast()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<Email | null>(null)
  const [creating, setCreating] = useState(false)

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  const loadEmails = async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/mail/emails', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) setEmails(data.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { loadEmails() }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/mail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        show(`Synchro terminée — ${data.data.aoDetected} AO détectés`)
        await loadEmails()
      } else {
        show(`Erreur : ${data.error}`)
      }
    } catch (e: any) {
      show(`Erreur : ${e.message}`)
    }
    setSyncing(false)
  }

  const handleCreateAo = async () => {
    if (!selected) return
    setCreating(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/mail/emails/${selected.id}/ao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        show('AO créé ✓')
        router.push(`/tenders/${data.data.tender_id}`)
      } else {
        show(`Erreur : ${data.error}`)
      }
    } catch (e: any) {
      show(`Erreur : ${e.message}`)
    }
    setCreating(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>
  )

  return (
    <div>
      {ToastComponent}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
          Boîte mail — Ingestion AO
        </span>
        <Button variant="ghost" loading={syncing} onClick={handleSync}>
          ⟳ Synchroniser
        </Button>
      </div>

      <div className="grid grid-cols-[280px_1fr] border border-white/10 rounded-lg overflow-hidden" style={{height: 'calc(100vh - 180px)'}}>
        <div className="border-r border-white/10 overflow-y-auto bg-[#021246]/80">
          {emails.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-10">
              Aucun email — lance une synchronisation
            </div>
          ) : (
            emails.map(email => (
              <div
                key={email.id}
                onClick={() => setSelected(email)}
                className={`px-4 py-3 border-b border-white/5 cursor-pointer transition-colors ${
                  selected?.id === email.id ? 'bg-white/5' : 'hover:bg-white/3'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {email.is_ao && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                  <div className={`text-xs truncate ${email.is_read ? 'text-slate-400' : 'text-white font-semibold'}`}>
                    {email.subject}
                  </div>
                </div>
                <div className="font-mono text-[10px] text-slate-500 truncate mb-1">{email.from_address}</div>
                <div className="flex gap-1">
                  {email.is_ao && <Badge color="amber">AO détecté</Badge>}
                  {email.tender_id && <Badge color="green">AO créé</Badge>}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-xs">
              Sélectionne un email
            </div>
          ) : (
            <>
              {selected.is_ao && !selected.tender_id && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
                  <span className="text-xs text-blue-300 flex-1">AO détecté — Score {selected.ao_score}/100</span>
                  <Button variant="primary" loading={creating} onClick={handleCreateAo}>Créer AO →</Button>
                </div>
              )}
              {selected.tender_id && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
                  <span className="text-xs text-emerald-300 flex-1">AO déjà créé depuis cet email</span>
                  <Button variant="success" onClick={() => router.push(`/tenders/${selected.tender_id}`)}>Voir l'AO →</Button>
                </div>
              )}
              <div className="text-sm font-bold mb-3">{selected.subject}</div>
              <div className="font-mono text-xs text-slate-500 mb-5 leading-loose">
                De : {selected.from_address}<br />
                Reçu : {selected.received_at ? new Date(selected.received_at).toLocaleString('fr-FR') : '—'}
              </div>
              <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                {selected.body_text?.slice(0, 1000)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}