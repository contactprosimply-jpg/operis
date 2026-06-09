'use client'

import { useEffect, useRef, useState } from 'react'
import { getSignatureData, stripSignatureFromBody } from '@/lib/email-signature'
import { buildConsultationDefaultBody } from '@/lib/email-compose'
import { Spinner } from '@/components/ui'

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 13,
  color: 'var(--text-primary)',
  fontFamily: 'DM Sans, system-ui',
}

function SignaturePreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { margin: 0; padding: 12px 16px; background: #fff; }
      img { max-width: 100%; height: auto; }
    </style></head><body>${html}</body></html>`)
    doc.close()
    const resize = () => {
      const h = doc.documentElement.scrollHeight || doc.body.scrollHeight
      iframe.style.height = `${Math.max(80, h + 8)}px`
    }
    resize()
    const t = setTimeout(resize, 150)
    return () => clearTimeout(t)
  }, [html])

  return (
    <iframe
      ref={iframeRef}
      title="Signature"
      style={{ width: '100%', border: 'none', display: 'block', minHeight: 80, borderRadius: 8 }}
    />
  )
}

export interface ConsultationRecipient {
  supplier_id: string
  name: string
  email: string
  status?: string
}

export interface ConsultationComposePayload {
  supplier_ids: string[]
  subject: string
  body: string
  signature: string
  cc?: string
  files: File[]
}

interface Props {
  open: boolean
  onClose: () => void
  tender: { title: string; client: string; description?: string | null; deadline?: string | null }
  recipients: ConsultationRecipient[]
  preselectIds?: string[]
  sending?: boolean
  onSend: (payload: ConsultationComposePayload) => void
}

export default function ConsultationComposeModal({
  open,
  onClose,
  tender,
  recipients,
  preselectIds,
  sending = false,
  onSend,
}: Props) {
  const [subject, setSubject] = useState('')
  const [cc, setCc] = useState('')
  const [body, setBody] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const signature = getSignatureData()

  useEffect(() => {
    if (!open) return
    const previewName = recipients[0]?.name
    setSubject(`Consultation — ${tender.title}`)
    setCc('')
    setBody(buildConsultationDefaultBody(tender, previewName))
    if (preselectIds?.length) {
      setSelected(preselectIds.filter(id => recipients.some(r => r.supplier_id === id)))
    } else {
      setSelected(recipients.filter(r => r.status === 'en_attente' || !r.status).map(r => r.supplier_id))
    }
    setFiles([])
  }, [open, tender.title, tender.client, tender.description, tender.deadline, recipients, preselectIds])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSend = () => {
    if (selected.length === 0) return
    const bodyWithoutSig = stripSignatureFromBody(body, signature.text)
    if (!subject.trim() || !bodyWithoutSig.trim() && !signature.html) return
    onSend({
      supplier_ids: selected,
      subject: subject.trim(),
      body: bodyWithoutSig,
      signature: signature.html,
      cc: cc.trim() || undefined,
      files,
    })
  }

  const selectedRecipients = recipients.filter(r => selected.includes(r.supplier_id))
  const toPreview = selectedRecipients.map(r => r.email).join(', ')

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
        borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Envoyer la consultation</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
              {tender.title}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-hi)',
            background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18,
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Fournisseurs */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Fournisseurs ({selected.length}/{recipients.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recipients.map(r => {
                const on = selected.includes(r.supplier_id)
                return (
                  <button
                    key={r.supplier_id}
                    type="button"
                    onClick={() => toggle(r.supplier_id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      border: `1px solid ${on ? 'rgba(59,126,246,0.35)' : 'var(--border)'}`,
                      background: on ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${on ? 'var(--accent)' : 'var(--border-hi)'}`,
                      background: on ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 11,
                    }}>
                      {on ? '✓' : ''}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
                      <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>{r.email}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Champs mail */}
          <div style={{
            border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
            background: 'var(--bg-secondary)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', width: 36 }}>À</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {toPreview || 'Sélectionnez des fournisseurs'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', width: 36 }}>Cc</span>
              <input
                type="email"
                value={cc}
                onChange={e => setCc(e.target.value)}
                placeholder="copie à (optionnel, plusieurs emails séparés par des virgules)"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', width: 36 }}>Objet</span>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={10}
              placeholder="Votre message…"
              style={{
                width: '100%', minHeight: 180, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui',
                resize: 'vertical', padding: '14px 16px', boxSizing: 'border-box',
              }}
            />
            {signature.html && (
              <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)', background: '#fff' }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', padding: '8px 4px', textTransform: 'uppercase' }}>Signature</div>
                <SignaturePreview html={signature.html} />
              </div>
            )}
          </div>

          {/* PJ */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  fontSize: 12, padding: '6px 12px', borderRadius: 7,
                  border: '1px solid var(--border-hi)', background: 'var(--bg-hover)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                }}
              >
                📎 Ajouter des pièces jointes
              </button>
              {files.map((f, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 6,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {f.name}
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
            <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
              onChange={e => { if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]) }} />
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 20px',
          borderTop: '1px solid var(--border)', flexShrink: 0,
        }}>
          <button type="button" onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-hi)',
            background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
            fontSize: 13, fontFamily: 'DM Sans, system-ui',
          }}>Annuler</button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || selected.length === 0 || !subject.trim()}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', cursor: sending ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'DM Sans, system-ui',
              opacity: sending || selected.length === 0 ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {sending && <Spinner size={14} />}
            Envoyer ({selected.length})
          </button>
        </div>
      </div>
    </div>
  )
}
