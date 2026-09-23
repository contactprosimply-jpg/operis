'use client'

import { useState } from 'react'
import MailComposePopup from '@/components/mail/MailComposePopup'
import { getAccessToken } from '@/lib/auth-client'
import { appendSignatureToBody, getSignatureData, stripSignatureFromBody } from '@/lib/email-signature'
import type { Supplier } from '@/types/database'

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// Rédaction depuis la fiche fournisseur : même fenêtre et même route d'envoi que la messagerie
// Operis (/api/mail/send) — le mail part par le compte connecté de l'utilisateur.
export default function SupplierMailComposer({ supplier, onClose, onSent }: {
  supplier: Supplier
  onClose: () => void
  onSent: (info: { pendingVerification: boolean }) => void
}) {
  const [compose, setCompose] = useState({ to: supplier.email, cc: '', bcc: '', subject: '', body: '' })
  const [attachments, setAttachments] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const send = async () => {
    const sig = getSignatureData()
    const bodyForSend = appendSignatureToBody(stripSignatureFromBody(compose.body, sig.text), sig.html.trim(), sig.text)
    if (!compose.to.trim() || !compose.subject.trim()) {
      setSendError('Destinataire et sujet requis')
      return
    }
    if (!bodyForSend.trim()) {
      setSendError('Message ou signature requis')
      return
    }
    setSending(true)
    setSendError(null)
    try {
      const attachmentPayload = await Promise.all(attachments.map(async f => ({
        filename: f.name,
        contentType: f.type || 'application/octet-stream',
        data: await fileToBase64(f),
      })))
      const token = await getAccessToken()
      if (!token) { setSendError('Session expirée — reconnectez-vous'); setSending(false); return }
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: compose.to,
          cc: compose.cc || undefined,
          bcc: compose.bcc || undefined,
          subject: compose.subject,
          body: bodyForSend,
          attachments: attachmentPayload.length > 0 ? attachmentPayload : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) onSent({ pendingVerification: data.data?.pendingVerification === true })
      else setSendError(data.error ?? 'Erreur envoi')
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : 'Erreur envoi')
    }
    setSending(false)
  }

  return (
    <MailComposePopup
      compose={compose}
      onChange={patch => setCompose(c => ({ ...c, ...patch }))}
      onSend={() => void send()}
      onRequestClose={onClose}
      onClosedByUser={onClose}
      onDelete={onClose}
      attachments={attachments}
      onRemoveAttachment={i => setAttachments(prev => prev.filter((_, j) => j !== i))}
      onAddAttachments={files => setAttachments(prev => [...prev, ...files])}
      sending={sending}
      sendError={sendError}
      draftSavedLabel={null}
      isListening={false}
      onToggleSpeech={() => {}}
      signaturePreview={getSignatureData()}
      suggestedCc={supplier.additional_emails ?? []}
    />
  )
}
