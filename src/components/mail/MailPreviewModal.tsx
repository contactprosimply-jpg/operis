'use client'

import { useModalBodyLock } from '@/components/ui'

export type MailPreviewData = {
  subject?: string | null
  from_address?: string | null
  received_at?: string | null
  body_html?: string | null
  body_text?: string | null
}

export default function MailPreviewModal({
  mail,
  onClose,
}: {
  mail: MailPreviewData
  onClose: () => void
}) {
  useModalBodyLock(true)

  const body = mail.body_html?.trim() || mail.body_text?.trim() || ''
  const isHtml = Boolean(mail.body_html?.trim())

  return (
    <div
      id="operis-mail-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu du mail"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(2, 18, 70, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(720px, 100%)',
          maxHeight: 'min(85vh, 720px)',
          background: 'var(--bg-card)',
          borderRadius: 14,
          border: '1px solid var(--border-hi)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          background: '#021246',
          color: '#fff',
        }}>
          <strong style={{ fontSize: 14, lineHeight: 1.4, fontFamily: 'DM Sans, system-ui' }}>
            {mail.subject ?? '(sans objet)'}
          </strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              minWidth: 44,
              minHeight: 44,
              border: 'none',
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </header>
        <p style={{
          margin: 0,
          padding: '10px 16px',
          fontSize: 11,
          color: 'var(--text-muted)',
          fontFamily: 'DM Mono, monospace',
          borderBottom: '1px solid var(--border)',
        }}>
          De : {mail.from_address ?? '—'}
          {' — '}
          {mail.received_at
            ? new Date(mail.received_at).toLocaleString('fr-FR')
            : '—'}
        </p>
        <div
          className="modal-body"
          style={{
            padding: 16,
            overflowY: 'auto',
            flex: 1,
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--text-primary)',
            fontFamily: 'DM Sans, system-ui',
          }}
          {...(isHtml
            ? { dangerouslySetInnerHTML: { __html: body } }
            : { children: body || '(corps vide)' })}
        />
      </div>
    </div>
  )
}
