'use client'

import { RefObject } from 'react'
import { Spinner } from '@/components/ui'

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 14,
  color: 'var(--text-primary)',
  fontFamily: 'DM Sans, system-ui',
}

export default function MailComposePanel({
  isMobile,
  compose,
  onChange,
  onSend,
  onCancel,
  onAttach,
  attachments,
  onRemoveAttachment,
  sending,
  sendError,
  isListening,
  onToggleSpeech,
  bodyRef,
  fileInputRef,
  onFilesSelected,
  signaturePreview,
  SignaturePreview,
}: {
  isMobile: boolean
  compose: { to: string; cc: string; bcc: string; subject: string; body: string }
  onChange: (patch: Partial<{ to: string; cc: string; bcc: string; subject: string; body: string }>) => void
  onSend: () => void
  onCancel: () => void
  onAttach: () => void
  attachments: File[]
  onRemoveAttachment: (index: number) => void
  sending: boolean
  sendError: string | null
  isListening: boolean
  onToggleSpeech: () => void
  bodyRef: RefObject<HTMLTextAreaElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  onFilesSelected: (files: FileList) => void
  signaturePreview: { html: string }
  SignaturePreview: React.ComponentType<{ html: string }>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '12px 14px' : '14px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Nouveau message</span>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: isMobile ? '0 12px' : '0 20px', flexShrink: 0 }}>
          {[
            { label: 'À', key: 'to' as const, type: 'email', placeholder: 'email@exemple.com' },
            { label: 'Cc', key: 'cc' as const, type: 'text', placeholder: 'copies (virgules)' },
            { label: 'Bcc', key: 'bcc' as const, type: 'text', placeholder: 'cci (virgules)' },
            { label: 'Objet', key: 'subject' as const, type: 'text', placeholder: 'Sujet du message' },
          ].map(field => (
            <div
              key={field.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderBottom: '1px solid var(--border)',
                padding: '10px 0',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'DM Mono, monospace',
                  color: 'var(--text-muted)',
                  width: 40,
                  textTransform: 'uppercase',
                }}
              >
                {field.label}
              </span>
              <input
                type={field.type}
                value={compose[field.key]}
                onChange={e => onChange({ [field.key]: e.target.value })}
                placeholder={field.placeholder}
                style={inputStyle}
              />
            </div>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 160,
            display: 'flex',
            flexDirection: 'column',
            margin: isMobile ? '12px' : '16px 20px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-hi)',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
            <textarea
              ref={bodyRef}
              value={compose.body}
              onChange={e => onChange({ body: e.target.value })}
              placeholder="Écrivez votre message…"
              style={{
                flex: 1,
                minHeight: 140,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 14,
                color: 'var(--text-primary)',
                fontFamily: 'DM Sans, system-ui',
                resize: 'none',
                padding: '16px 18px',
                lineHeight: 1.6,
              }}
            />
            <button
              type="button"
              onClick={onToggleSpeech}
              title="Dictée vocale"
              style={{
                margin: '12px 12px 0 0',
                width: 38,
                height: 38,
                borderRadius: '50%',
                flexShrink: 0,
                border: isListening ? '2px solid #ef4444' : '1px solid var(--border-hi)',
                background: isListening ? 'rgba(239,68,68,0.12)' : 'var(--bg-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke={isListening ? '#ef4444' : 'currentColor'} strokeWidth="1.8" width="16" height="16">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          </div>
          {signaturePreview.html && (
            <div style={{ padding: '0 14px 14px', flexShrink: 0 }}>
              <SignaturePreview html={signaturePreview.html} />
            </div>
          )}
        </div>

        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: isMobile ? '0 12px 8px' : '0 20px 8px' }}>
            {attachments.map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                📎 {f.name}
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 14 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {sendError && (
          <div
            style={{
              margin: isMobile ? '0 12px 8px' : '0 20px 8px',
              fontSize: 12,
              color: '#f87171',
              background: 'rgba(239,68,68,0.1)',
              borderRadius: 8,
              padding: '10px 14px',
            }}
          >
            {sendError}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: isMobile ? '12px' : '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card)',
            alignItems: 'center',
            flexWrap: 'wrap',
            flexShrink: 0,
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
              borderRadius: 9,
              padding: '10px 22px',
              fontSize: 13,
              fontWeight: 600,
              cursor: sending ? 'wait' : 'pointer',
              opacity: sending ? 0.7 : 1,
              fontFamily: 'DM Sans, system-ui',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(59,126,246,0.3)',
            }}
          >
            {sending && <Spinner size={12} />}
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
          <button
            type="button"
            onClick={onAttach}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-hi)',
              color: 'var(--text-secondary)',
              borderRadius: 9,
              padding: '9px 14px',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'DM Sans, system-ui',
            }}
          >
            📎 Joindre
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files) onFilesSelected(e.target.files) }}
          />
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'DM Sans, system-ui',
              marginLeft: 'auto',
            }}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
