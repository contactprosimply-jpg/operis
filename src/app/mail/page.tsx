'use client'
// ============================================================
// OPERIS — app/mail/page.tsx
// Boîte mail connectée — ingestion IMAP réelle
// ============================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMail } from '@/hooks'
import { Button, Badge, Spinner, useToast } from '@/components/ui'
import { Email } from '@/types/database'

export default function MailPage() {
  const router = useRouter()
  const { emails, loading, syncing, sync, createTenderFromEmail } = useMail()
  const { show, ToastComponent } = useToast()
  const [selected, setSelected] = useState<Email | null>(null)
  const [creating, setCreating] = useState(false)

  const handleSync = async () => {
    const res = await sync()
    if (res.success) show(`Synchro terminée — ${res.data.aoDetected} AO détectés`)
  }

  const handleCreateAo = async () => {
    if (!selected) return
    setCreating(true)
    const res = await createTenderFromEmail(selected.id)
    setCreating(false)
    if (res.success) {
      show('AO créé ✓')
      router.push(`/tenders/${res.data.tender_id}`)
    } else {
      show(`Erreur : ${res.error}`)
    }
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

      <div className="grid grid-cols-[280px_1fr] border border-white/10 rounded-lg overflow-hidden h-[calc(100vh-180px)]">

        {/* Liste emails */}
        <div className="border-r border-white/10 overflow-y-auto bg-[#021246]/80">
          {emails.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-10">
              Aucun email — cliquez sur Synchroniser
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
                  {email.is_ao && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  )}
                  <div className={`text-xs truncate ${email.is_read ? 'text-slate-400 font-normal' : 'text-white font-semibold'}`}>
                    {email.subject}
                  </div>
                </div>
                <div className="font-mono text-[10px] text-slate-500 truncate mb-1">
                  {email.from_address}
                </div>
                <div className="flex gap-1">
                  {email.is_ao && <Badge color="amber">AO détecté</Badge>}
                  {email.tender_id && <Badge color="green">AO créé</Badge>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Détail email */}
        <div className="p-6 overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-xs">
              Sélectionne un email
            </div>
          ) : (
            <>
              {/* Banner AO détecté */}
              {selected.is_ao && !selected.tender_id && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
                  <span className="text-xs text-blue-300 flex-1">
                    AO détecté — Score {selected.ao_score}/100
                  </span>
                  <Button variant="primary" loading={creating} onClick={handleCreateAo}>
                    Créer AO →
                  </Button>
                </div>
              )}
              {selected.tender_id && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
                  <span className="text-xs text-emerald-300 flex-1">AO déjà créé depuis cet email</span>
                  <Button variant="success" onClick={() => router.push(`/tenders/${selected.tender_id}`)}>
                    Voir l'AO →
                  </Button>
                </div>
              )}

              <div className="text-sm font-bold mb-3">{selected.subject}</div>
              <div className="font-mono text-xs text-slate-500 mb-5 leading-loose">
                De : {selected.from_address}<br />
                Reçu : {selected.received_at ? new Date(selected.received_at).toLocaleString('fr-FR') : '—'}
              </div>
              <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                {selected.body_text}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
