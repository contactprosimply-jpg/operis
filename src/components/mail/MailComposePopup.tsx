'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from '@/components/ui'
import { getSignatureData } from '@/lib/email-signature'
import { useExternalWindowPortal } from '@/lib/use-external-window'
import ContactRecipientField from '@/components/mail/ContactRecipientField'
import type { OperisContact } from '@/lib/contacts'

const WINDOW_WIDTH = 760
const WINDOW_HEIGHT = 680

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 13,
  color: 'var(--text-primary)',
  fontFamily: 'DM Sans, system-ui',
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

type FileChoiceState = { files: File[] } | null

export default function MailComposePopup({
  compose,
  onChange,
  onSend,
  onRequestClose,
  onClosedByUser,
  closeConfirm,
  onDelete,
  attachments,
  onRemoveAttachment,
  onAddAttachments,
  sending,
  sendError,
  draftSavedLabel,
  isListening,
  onToggleSpeech,
  signaturePreview,
  contactsRef,
  tenderId,
  suggestedTenderContacts,
}: {
  compose: { to: string; cc: string; bcc: string; subject: string; body: string }
  onChange: (patch: Partial<{ to: string; cc: string; bcc: string; subject: string; body: string }>) => void
  onSend: () => void
  onRequestClose: () => void
  /** Fenêtre fermée directement par l'utilisateur (bouton natif du système) — pas de
   *  confirmation possible à ce stade, on sauvegarde silencieusement si besoin. */
  onClosedByUser: () => void
  closeConfirm?: {
    open: boolean
    onSave: () => void
    onDiscard: () => void
    onCancel: () => void
  }
  onDelete: () => void
  attachments: File[]
  onRemoveAttachment: (index: number) => void
  onAddAttachments: (files: File[]) => void
  sending: boolean
  sendError: string | null
  draftSavedLabel: string | null
  isListening: boolean
  onToggleSpeech: () => void
  signaturePreview: { html: string }
  contactsRef?: React.RefObject<OperisContact[] | null>
  tenderId?: string | null
  suggestedTenderContacts?: OperisContact[]
}) {
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [fileChoice, setFileChoice] = useState<FileChoiceState>(null)
  const [signatureExpanded, setSignatureExpanded] = useState(true)
  const bodyRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bodyInitRef = useRef<string | null>(null)
  const dragDepthRef = useRef(0)

  // Vraie fenêtre séparée (comme Thunderbird) — pas une popup superposée à la page.
  const mount = useExternalWindowPortal(true, {
    title: compose.subject.trim() || 'Nouveau message — Operis',
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    onClosedByUser,
  })

  useEffect(() => {
    const preventDefault = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', preventDefault)
    window.addEventListener('drop', preventDefault)
    return () => {
      window.removeEventListener('dragover', preventDefault)
      window.removeEventListener('drop', preventDefault)
    }
  }, [])

  useEffect(() => {
    if (compose.cc.trim()) setShowCc(true)
    if (compose.bcc.trim()) setShowBcc(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const signatureCollapsedLabel = useMemo(() => {
    if (!signaturePreview.html) return ''
    try {
      const stored = JSON.parse(localStorage.getItem('operis_signature') ?? '{}') as { name?: string }
      if (stored.name?.trim()) return `-- ${stored.name.trim()}`
    } catch { /* ignore */ }
    const line = getSignatureData().text.split('\n').find(l => l.trim().startsWith('--'))
    if (line?.trim()) return line.trim()
    return '-- Signature'
  }, [signaturePreview.html])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (bodyInitRef.current !== compose.body) {
      if (compose.body.includes('<') && compose.body.includes('>')) {
        el.innerHTML = compose.body
      } else {
        el.textContent = compose.body
      }
      bodyInitRef.current = compose.body
    }
  }, [compose.body])

  const onBodyInput = () => {
    const html = bodyRef.current?.innerHTML ?? ''
    bodyInitRef.current = html
    onChange({ body: html })
  }

  const handleFiles = (files: File[]) => {
    if (!files.length) return
    setFileChoice({ files })
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current += 1
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragActive(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = 0
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }

  const handleFileInput = (files: FileList | null) => {
    if (!files?.length) return
    handleFiles(Array.from(files))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const applyFileChoice = async (mode: 'attach' | 'inline') => {
    if (!fileChoice) return
    const files = fileChoice.files
    setFileChoice(null)
    if (mode === 'attach') {
      onAddAttachments(files)
      return
    }
    for (const file of files) {
      if (!isImageFile(file)) continue
      const dataUrl = await readFileAsDataUrl(file)
      insertInlineImage(dataUrl)
    }
  }

  const insertInlineImage = (dataUrl: string) => {
    const el = bodyRef.current
    if (!el) return
    el.focus()
    document.execCommand('insertImage', false, dataUrl)
    onBodyInput()
  }

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  const closeConfirmDialog = closeConfirm?.open ? (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={closeConfirm.onCancel}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-hi)',
          borderRadius: 12,
          padding: 20,
          maxWidth: 400,
          width: '100%',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          fontFamily: 'DM Sans, system-ui',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          Fermer le message ?
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 18px' }}>
          Votre message n&apos;est pas sauvegardé dans les brouillons. Voulez-vous le sauvegarder avant de fermer ?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={closeConfirm.onSave} style={confirmPrimaryBtnStyle}>
            Sauvegarder dans les brouillons
          </button>
          <button type="button" onClick={closeConfirm.onDiscard} style={confirmDangerBtnStyle}>
            Fermer sans sauvegarder
          </button>
          <button type="button" onClick={closeConfirm.onCancel} style={confirmSecondaryBtnStyle}>
            Continuer l&apos;édition
          </button>
        </div>
      </div>
    </div>
  ) : null

  const content = (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'DM Sans, system-ui',
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(59, 127, 232, 0.12)',
            border: '2px dashed #3B7FE8',
            borderRadius: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span style={{ color: 'var(--accent)', fontSize: 15, fontWeight: 600 }}>Déposez vos fichiers ici</span>
        </div>
      )}

      {fileChoice && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 60,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setFileChoice(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-hi)',
              borderRadius: 12,
              padding: 16,
              minWidth: 280,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              {fileChoice.files.length} fichier(s) sélectionné(s)
            </div>
            <button type="button" onClick={() => applyFileChoice('attach')} style={choiceBtnStyle}>
              <span>📎</span> Ajouter en pièce jointe
            </button>
            <button
              type="button"
              onClick={() => applyFileChoice('inline')}
              disabled={!fileChoice.files.some(isImageFile)}
              style={{
                ...choiceBtnStyle,
                opacity: fileChoice.files.some(isImageFile) ? 1 : 0.45,
                cursor: fileChoice.files.some(isImageFile) ? 'pointer' : 'not-allowed',
              }}
            >
              <span>🖼️</span> Intégrer dans le message
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Nouveau message</span>
        <button type="button" onClick={onRequestClose} title="Fermer" style={iconBtnStyle}>×</button>
      </div>

      <div style={{ padding: '0 14px', flexShrink: 0 }}>
          <FieldRow label="À">
            {contactsRef ? (
              <ContactRecipientField
                value={compose.to}
                onChange={v => onChange({ to: v })}
                placeholder="email@exemple.com, plusieurs…"
                contactsRef={contactsRef}
                tenderId={tenderId}
                suggestedTenderContacts={suggestedTenderContacts}
                inputStyle={inputStyle}
              />
            ) : (
              <input
                type="text"
                value={compose.to}
                onChange={e => onChange({ to: e.target.value })}
                placeholder="email@exemple.com, plusieurs…"
                style={inputStyle}
              />
            )}
          </FieldRow>
          {!showCc && !showBcc && (
            <div style={{ padding: '4px 0 8px', display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => setShowCc(true)} style={linkBtnStyle}>Cc</button>
              <button type="button" onClick={() => setShowBcc(true)} style={linkBtnStyle}>Cci</button>
            </div>
          )}
          {showCc && (
            <FieldRow label="Cc">
              {contactsRef ? (
                <ContactRecipientField
                  value={compose.cc}
                  onChange={v => onChange({ cc: v })}
                  placeholder="copies (virgules)"
                  contactsRef={contactsRef}
                  tenderId={tenderId}
                  inputStyle={inputStyle}
                />
              ) : (
                <input
                  type="text"
                  value={compose.cc}
                  onChange={e => onChange({ cc: e.target.value })}
                  placeholder="copies (virgules)"
                  style={inputStyle}
                />
              )}
            </FieldRow>
          )}
          {showBcc && (
            <FieldRow label="Cci">
              {contactsRef ? (
                <ContactRecipientField
                  value={compose.bcc}
                  onChange={v => onChange({ bcc: v })}
                  placeholder="cci (virgules)"
                  contactsRef={contactsRef}
                  tenderId={tenderId}
                  inputStyle={inputStyle}
                />
              ) : (
                <input
                  type="text"
                  value={compose.bcc}
                  onChange={e => onChange({ bcc: e.target.value })}
                  placeholder="cci (virgules)"
                  style={inputStyle}
                />
              )}
            </FieldRow>
          )}
          <FieldRow label="Objet">
            <input
              type="text"
              value={compose.subject}
              onChange={e => onChange({ subject: e.target.value })}
              placeholder="Sujet du message"
              style={inputStyle}
            />
          </FieldRow>
        </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            margin: '8px 14px 0',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            onInput={onBodyInput}
            data-placeholder="Écrivez votre message…"
            style={{
              flex: 1,
              minHeight: 0,
              padding: '14px 16px',
              fontSize: 14,
              color: 'var(--text-primary)',
              lineHeight: 1.6,
              outline: 'none',
              overflowY: 'auto',
            }}
            className="mail-compose-body"
          />
          <button
            type="button"
            onClick={onToggleSpeech}
            title="Dictée vocale"
            style={{
              margin: '10px 10px 0 0',
              width: 34,
              height: 34,
              borderRadius: '50%',
              flexShrink: 0,
              border: isListening ? '2px solid #ef4444' : '1px solid var(--border-hi)',
              background: isListening ? 'rgba(239,68,68,0.2)' : 'var(--bg-hover)',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            🎤
          </button>
        </div>

        {signaturePreview.html && (
          <div
            style={{
              flexShrink: 0,
              margin: '0 14px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
            }}
          >
            <button
              type="button"
              onClick={() => setSignatureExpanded(prev => !prev)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'DM Mono, monospace',
                minHeight: 40,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {signatureCollapsedLabel}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                {signatureExpanded ? '▲' : '▼'}
              </span>
            </button>
            <div style={{ padding: '0 8px 8px' }}>
              <ComposeSignaturePreview html={signaturePreview.html} expanded={signatureExpanded} />
            </div>
          </div>
        )}
      </div>

        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 14px 0', flexShrink: 0 }}>
            {attachments.map((f, i) => (
              <div key={`${f.name}-${i}`} style={chipStyle}>
                <span>📄 {f.name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{formatFileSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(i)}
                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {sendError && (
          <div style={{ margin: '0 14px 8px', fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.15)', borderRadius: 8, padding: '8px 12px' }}>
            {sendError}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            style={{
              background: 'var(--gradient-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 20px',
              fontSize: 13,
              fontWeight: 600,
              cursor: sending ? 'wait' : 'pointer',
              opacity: sending ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {sending && <Spinner size={12} />}
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
          <button type="button" onClick={onDelete} style={secondaryBtnStyle} title="Supprimer le brouillon">
            🗑️ Supprimer
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={secondaryBtnStyle}
            title="Joindre un fichier"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleFileInput(e.target.files)}
          />
          {draftSavedLabel && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'DM Mono, monospace' }}>
              {draftSavedLabel}
            </span>
          )}
        </div>
      {closeConfirmDialog}
    </div>
  )

  if (!mount) return null
  return createPortal(content, mount)
}

function ComposeSignaturePreview({ html, expanded }: { html: string; expanded: boolean }) {
  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 8,
        border: '1px solid var(--border)',
        padding: '8px 12px',
        maxHeight: expanded ? 140 : 60,
        overflow: expanded ? 'auto' : 'hidden',
        fontSize: 12,
        color: '#374151',
        lineHeight: 1.5,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
      <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', width: 36, textTransform: 'uppercase' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: 'none',
  color: 'var(--text-primary)',
  width: 28,
  height: 28,
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 11,
  cursor: 'pointer',
  padding: 0,
}

const choiceBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '12px 14px',
  marginBottom: 8,
  borderRadius: 8,
  border: '1px solid var(--border-hi)',
  background: 'var(--bg-hover)',
  color: 'var(--text-primary)',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'DM Sans, system-ui',
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--border-hi)',
  color: 'var(--text-primary)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  cursor: 'pointer',
}

const chipStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--bg-hover)',
  border: '1px solid var(--border-hi)',
  borderRadius: 8,
  padding: '4px 10px',
  fontSize: 11,
  color: 'var(--text-primary)',
}

const confirmPrimaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--gradient-primary)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'DM Sans, system-ui',
}

const confirmDangerBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid rgba(239,68,68,0.4)',
  background: 'rgba(239,68,68,0.12)',
  color: '#fca5a5',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'DM Sans, system-ui',
}

const confirmSecondaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--border-hi)',
  background: 'var(--bg-hover)',
  color: 'var(--text-primary)',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'DM Sans, system-ui',
}
