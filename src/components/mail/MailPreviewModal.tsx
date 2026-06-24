'use client'

import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { useModalBodyLock } from '@/components/ui'

export type MailPreviewData = {
  subject?: string | null
  from_address?: string | null
  to_address?: string | null
  received_at?: string | null
  body_html?: string | null
  body_text?: string | null
}

function senderInitial(from: string | null | undefined): string {
  const raw = (from ?? '?').trim()
  const name = raw.split('<')[0].trim()
  const letter = (name[0] ?? raw[0] ?? '?').toUpperCase()
  return letter
}

function linkifyPlainText(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  )
}

export default function MailPreviewModal({
  mail,
  onClose,
}: {
  mail: MailPreviewData
  onClose: () => void
}) {
  useModalBodyLock(true)

  const isHtml = Boolean(mail.body_html?.trim())
  const cleanHtml = useMemo(
    () => (isHtml ? DOMPurify.sanitize(mail.body_html ?? '', { USE_PROFILES: { html: true } }) : ''),
    [isHtml, mail.body_html],
  )

  const srcDoc = useMemo(() => {
    if (!isHtml) return null
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'DM Sans',sans-serif;color:#1a1a1a;
       line-height:1.6;padding:16px;max-width:680px;margin:0 auto;word-break:break-word;}
  img{max-width:100%;height:auto;} a{color:#2563eb;}
  table{max-width:100%;}
</style></head><body>${cleanHtml}</body></html>`
  }, [isHtml, cleanHtml])

  const plainHtml = useMemo(() => {
    if (isHtml) return ''
    const text = mail.body_text?.trim() ?? ''
    return linkifyPlainText(text)
  }, [isHtml, mail.body_text])

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
        className="mail-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(760px, 92vw)',
          maxHeight: '88vh',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          className="mail-modal-header"
          style={{
            background: '#021246',
            color: '#fff',
            padding: '16px 20px',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="close"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              position: 'absolute',
              top: 12,
              right: 14,
              minWidth: 44,
              minHeight: 44,
              background: 'none',
              border: 'none',
              color: '#fff',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
          <h2
            className="mail-subject"
            style={{
              fontSize: 18,
              margin: '0 0 12px',
              paddingRight: 28,
              lineHeight: 1.35,
              fontFamily: 'DM Sans, system-ui',
              fontWeight: 700,
            }}
          >
            {mail.subject ?? '(sans objet)'}
          </h2>
          <div className="mail-meta" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              className="avatar"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#FFB400',
                color: '#021246',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                flexShrink: 0,
                fontFamily: 'DM Sans, system-ui',
              }}
            >
              {senderInitial(mail.from_address)}
            </div>
            <div className="mail-meta-text" style={{ minWidth: 0, flex: 1 }}>
              <div className="from" style={{ fontSize: 14 }}>
                <strong>{mail.from_address ?? '—'}</strong>
              </div>
              {mail.to_address && (
                <div className="to" style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
                  À : {mail.to_address}
                </div>
              )}
            </div>
            <div
              className="date"
              style={{
                marginLeft: 'auto',
                fontSize: 13,
                opacity: 0.8,
                whiteSpace: 'nowrap',
                fontFamily: 'DM Mono, monospace',
              }}
            >
              {mail.received_at
                ? new Date(mail.received_at).toLocaleString('fr-FR')
                : '—'}
            </div>
          </div>
        </header>

        <div className="mail-body" style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
          {isHtml && srcDoc ? (
            <iframe
              title="Aperçu du mail"
              sandbox=""
              srcDoc={srcDoc}
              style={{ width: '100%', height: 'min(60vh, 520px)', border: 0, background: '#fff', display: 'block' }}
            />
          ) : (
            <pre
              className="mail-plain"
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'DM Sans, system-ui',
                fontSize: 14,
                lineHeight: 1.6,
                color: '#1a1a1a',
                padding: 16,
                margin: 0,
                maxWidth: 680,
              }}
              dangerouslySetInnerHTML={{ __html: plainHtml || '(corps vide)' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
