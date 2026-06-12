'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from '@/components/ui'

const POPUP_WIDTH = 560
const POPUP_HEIGHT = 520
const POPUP_Z_INDEX = 10050

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 13,
  color: '#e8eaef',
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
  onClose,
  onMinimize,
  onRestore,
  onDelete,
  attachments,
  onRemoveAttachment,
  onAddAttachments,
  sending,
  sendError,
  draftSavedLabel,
  isListening,
  onToggleSpeech,
  minimized,
  signaturePreview,
  SignaturePreview,
}: {
  compose: { to: string; cc: string; bcc: string; subject: string; body: string }
  onChange: (patch: Partial<{ to: string; cc: string; bcc: string; subject: string; body: string }>) => void
  onSend: () => void
  onClose: () => void
  onMinimize: () => void
  onRestore: () => void
  onDelete: () => void
  attachments: File[]
  onRemoveAttachment: (index: number) => void
  onAddAttachments: (files: File[]) => void
  sending: boolean
  sendError: string | null
  draftSavedLabel: string | null
  isListening: boolean
  onToggleSpeech: () => void
  minimized: boolean
  signaturePreview: { html: string }
  SignaturePreview: React.ComponentType<{ html: string }>
}) {
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [fileChoice, setFileChoice] = useState<FileChoiceState>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bodyInitRef = useRef<string | null>(null)
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (compose.cc.trim()) setShowCc(true)
    if (compose.bcc.trim()) setShowBcc(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.currentTarget === e.target) setDragActive(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) setFileChoice({ files })
  }

  const handleFilesPicked = (files: FileList | null) => {
    if (!files?.length) return
    setFileChoice({ files: Array.from(files) })
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

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setDragOffset({
        x: dragRef.current.originX + ev.clientX - dragRef.current.startX,
        y: dragRef.current.originY + ev.clientY - dragRef.current.startY,
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const subjectLabel = compose.subject.trim() || compose.to.trim() || 'Nouveau message'

  const minimizedBar = (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 24,
        width: `min(${POPUP_WIDTH}px, calc(100vw - 48px))`,
        height: 44,
        zIndex: POPUP_Z_INDEX,
        background: '#021246',
        borderRadius: '10px 10px 0 0',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        border: '1px solid rgba(255,255,255,0.1)',
        fontFamily: 'DM Sans, system-ui',
      }}
    >
      <button
        type="button"
        onClick={onRestore}
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          color: '#e8eaef',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {subjectLabel}
      </button>
      <button type="button" onClick={onRestore} title="Restaurer" style={iconBtnStyle}>▢</button>
      <button type="button" onClick={onClose} title="Fermer" style={iconBtnStyle}>×</button>
    </div>
  )

  const expandedPopup = (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        right: 24,
        width: `min(${POPUP_WIDTH}px, calc(100vw - 48px))`,
        height: POPUP_HEIGHT,
        maxHeight: 'calc(100vh - 24px)',
        zIndex: POPUP_Z_INDEX,
        borderRadius: '12px 12px 0 0',
        background: '#021246',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
        fontFamily: 'DM Sans, system-ui',
        border: '1px solid rgba(255,255,255,0.08)',
        animation: 'mailComposeSlideUp 0.22s ease-out',
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header draggable */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          background: 'linear-gradient(135deg, #021246 0%, #0a2d6b 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          cursor: 'grab',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Nouveau message</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={onMinimize} title="Réduire" style={iconBtnStyle}>—</button>
          <button type="button" onClick={onClose} title="Fermer" style={iconBtnStyle}>×</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        {dragActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(59, 127, 232, 0.15)',
              border: '2px dashed #3B7FE8',
              borderRadius: 12,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ color: '#7dd3fc', fontSize: 15, fontWeight: 600 }}>Déposez votre fichier ici</span>
          </div>
        )}

        {fileChoice && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 20,
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
                background: '#0d1f4a',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 12,
                padding: 16,
                minWidth: 280,
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
                {fileChoice.files.length} fichier(s) sélectionné(s)
              </div>
              <button
                type="button"
                onClick={() => applyFileChoice('attach')}
                style={choiceBtnStyle}
              >
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

        <div style={{ padding: '0 14px', flexShrink: 0 }}>
          <FieldRow label="À">
            <input
              type="text"
              value={compose.to}
              onChange={e => onChange({ to: e.target.value })}
              placeholder="email@exemple.com, plusieurs…"
              style={inputStyle}
            />
          </FieldRow>
          {!showCc && !showBcc && (
            <div style={{ padding: '4px 0 8px', display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => setShowCc(true)} style={linkBtnStyle}>Cc</button>
              <button type="button" onClick={() => setShowBcc(true)} style={linkBtnStyle}>Cci</button>
            </div>
          )}
          {showCc && (
            <FieldRow label="Cc">
              <input
                type="text"
                value={compose.cc}
                onChange={e => onChange({ cc: e.target.value })}
                placeholder="copies (virgules)"
                style={inputStyle}
              />
            </FieldRow>
          )}
          {showBcc && (
            <FieldRow label="Cci">
              <input
                type="text"
                value={compose.bcc}
                onChange={e => onChange({ bcc: e.target.value })}
                placeholder="cci (virgules)"
                style={inputStyle}
              />
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

        <div
          style={{
            flex: 1,
            minHeight: 120,
            margin: '8px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <div
              ref={bodyRef}
              contentEditable
              suppressContentEditableWarning
              onInput={onBodyInput}
              data-placeholder="Écrivez votre message…"
              style={{
                flex: 1,
                minHeight: 100,
                padding: '14px 16px',
                fontSize: 14,
                color: '#e8eaef',
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
                border: isListening ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
                background: isListening ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
                cursor: 'pointer',
                color: '#e8eaef',
              }}
            >
              🎤
            </button>
          </div>
          {signaturePreview.html && (
            <div style={{ padding: '0 12px 12px', flexShrink: 0 }}>
              <SignaturePreview html={signaturePreview.html} />
            </div>
          )}
        </div>

        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 14px 8px' }}>
            {attachments.map((f, i) => (
              <div key={`${f.name}-${i}`} style={chipStyle}>
                <span>📄 {f.name}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{formatFileSize(f.size)}</span>
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
            borderTop: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.2)',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            style={{
              background: 'linear-gradient(135deg, #3b7ef6 0%, #6366f1 100%)',
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
          <button type="button" onClick={() => fileInputRef.current?.click()} style={secondaryBtnStyle}>
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleFilesPicked(e.target.files)}
          />
          {draftSavedLabel && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginLeft: 'auto', fontFamily: 'DM Mono, monospace' }}>
              {draftSavedLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  if (!portalReady) return null
  return createPortal(minimized ? minimizedBar : expandedPopup, document.body)
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '8px 0' }}>
      <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'rgba(255,255,255,0.45)', width: 36, textTransform: 'uppercase' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: 'none',
  color: '#e8eaef',
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
  color: '#7dd3fc',
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
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
  color: '#e8eaef',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'DM Sans, system-ui',
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#e8eaef',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  cursor: 'pointer',
}

const chipStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '4px 10px',
  fontSize: 11,
  color: '#e8eaef',
}
