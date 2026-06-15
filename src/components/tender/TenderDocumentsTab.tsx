'use client'

import { useState } from 'react'
import { Button, Modal } from '@/components/ui'
import type {
  TenderDocumentGroup,
  TenderDocumentItem,
  TenderDocumentVersion,
} from '@/lib/tender-documents'

function documentCategoryStyle(category?: string) {
  switch (category) {
    case 'ao_inbound':
      return { background: 'rgba(59,126,246,0.14)', color: '#60a5fa', border: '1px solid rgba(59,126,246,0.25)' }
    case 'supplier_response':
      return { background: 'rgba(74,222,128,0.14)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }
    case 'consultation_sent':
      return { background: 'rgba(251,191,36,0.14)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }
    case 'relance_sent':
      return { background: 'rgba(248,113,113,0.14)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }
    case 'document_sent':
      return { background: 'rgba(251,191,36,0.14)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }
    default:
      return { background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
  }
}

function versionAccentColor(doc: TenderDocumentItem): string {
  if (doc.kind === 'sent') return '#fbbf24'
  if (doc.category === 'supplier_response') return '#4ade80'
  return '#60a5fa'
}

function mailSourceBadge(source?: string | null) {
  if (source === 'mail_received') return { label: '📧 Reçu par mail', color: '#60a5fa' }
  if (source === 'mail_sent') return { label: '📤 Envoyé par mail', color: '#fbbf24' }
  if (source === 'manual') return { label: '📁 Manuel', color: 'var(--text-muted)' }
  return null
}

function formatFileSize(size?: number) {
  if (!size) return '—'
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`
}

function formatDate(date?: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function versionDirectionLabel(doc: TenderDocumentItem) {
  if (doc.kind === 'sent') {
    const who = doc.supplier_name?.trim() || 'contact'
    return `Envoyé · ${who}`
  }
  const who = doc.supplier_name?.trim() || 'Client'
  if (doc.category === 'supplier_response') return `Réponse · ${who}`
  return `Reçu · ${who}`
}

type DocRow = TenderDocumentItem & {
  display_title?: string
  category?: string
  supplier_name?: string
  label?: string
  mail_source?: string | null
  email_id?: string
  attachment_index?: number
  is_png?: boolean
  is_optional?: boolean
  contentType?: string
}

function DocumentVersionTimeline({
  versions,
  onDownload,
  onOpenMail,
  highlightId,
}: {
  versions: TenderDocumentVersion[]
  onDownload: (doc: TenderDocumentItem) => void
  onOpenMail?: (emailId: string) => void
  highlightId?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {versions.map((v, idx) => {
        const accent = versionAccentColor(v)
        const isLast = idx === versions.length - 1
        const isHighlight = highlightId === v.id
        const badgeStyle = documentCategoryStyle(v.category)
        const sourceBadge = mailSourceBadge(v.mail_source)

        return (
          <div key={v.id} style={{ display: 'flex', gap: 12, minHeight: 72 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: accent, border: `2px solid ${accent}`,
                boxShadow: isHighlight ? `0 0 0 3px ${accent}33` : 'none',
              }} />
              {!isLast && (
                <div style={{ width: 2, flex: 1, minHeight: 24, background: 'var(--border)', marginTop: 4 }} />
              )}
            </div>
            <div style={{
              flex: 1, marginBottom: isLast ? 0 : 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: isHighlight ? `1px solid ${accent}` : '1px solid var(--border)',
              background: isHighlight ? `${accent}0d` : 'var(--bg-secondary)',
              borderLeft: `3px solid ${accent}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono, monospace',
                  color: accent, letterSpacing: '0.04em',
                }}>
                  v{v.version_number}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, fontFamily: 'DM Sans, system-ui',
                  color: accent,
                }}>
                  {versionDirectionLabel(v)}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
                  {formatDate(v.date)}
                </span>
              </div>
              {v.display_title && (
                <div style={{
                  fontSize: 10, fontWeight: 600, fontFamily: 'DM Sans, system-ui',
                  padding: '2px 8px', borderRadius: 4, marginBottom: 6,
                  display: 'inline-block', ...badgeStyle,
                }}>
                  {v.display_title}
                </div>
              )}
              <div style={{
                fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {v.is_png ? '🖼' : '📎'} {v.filename}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'DM Mono, monospace' }}>
                {formatFileSize(v.size)}
                {v.label ? ` · ${v.label}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {sourceBadge && v.email_id && (
                  <button
                    type="button"
                    onClick={() => onOpenMail?.(v.email_id!)}
                    style={{
                      fontSize: 10, fontWeight: 600, fontFamily: 'DM Sans, system-ui',
                      padding: '3px 8px', borderRadius: 4,
                      border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                      color: sourceBadge.color, cursor: 'pointer',
                    }}
                  >
                    {sourceBadge.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDownload(v)}
                  style={{
                    fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)',
                    border: '1px solid rgba(59,126,246,0.2)', borderRadius: 6,
                    padding: '3px 10px', cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                  }}
                >
                  Télécharger
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DocumentDetailModal({
  group,
  highlightDoc,
  onClose,
  onDownload,
  onOpenMail,
}: {
  group: TenderDocumentGroup
  highlightDoc?: TenderDocumentItem
  onClose: () => void
  onDownload: (doc: TenderDocumentItem) => void
  onOpenMail?: (emailId: string) => void
}) {
  const latest = group.latest
  return (
    <Modal open onClose={onClose} title={group.label}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          {group.version_count} version{group.version_count > 1 ? 's' : ''} · dernière : {formatDate(latest.date)}
        </div>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          padding: '10px 12px', borderRadius: 8,
          background: `${versionAccentColor(latest)}14`,
          border: `1px solid ${versionAccentColor(latest)}40`,
        }}>
          Version actuelle : {latest.is_png ? '🖼' : '📎'} {latest.filename}
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Historique des versions
      </div>
      <DocumentVersionTimeline
        versions={group.versions}
        onDownload={onDownload}
        onOpenMail={onOpenMail}
        highlightId={highlightDoc?.id ?? latest.id}
      />
    </Modal>
  )
}

function TenderDocumentRow({
  doc,
  versionCount,
  onOpenDetail,
  onDownload,
  onOpenMail,
  onExcludePng,
  excluding,
}: {
  doc: DocRow
  versionCount?: number
  onOpenDetail?: () => void
  onDownload: () => void
  onOpenMail?: (emailId: string) => void
  onExcludePng?: (emailId: string, attachmentIndex: number) => void
  excluding?: boolean
}) {
  const title = doc.display_title
    ?? (doc.supplier_name ? `${doc.supplier_name}` : doc.label ?? 'Document')
  const badgeStyle = documentCategoryStyle(doc.category)
  const sourceBadge = mailSourceBadge(doc.mail_source)
  const accent = versionAccentColor(doc as TenderDocumentItem)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail?.()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpenDetail?.() }}
      style={{
        padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 8, borderLeft: `3px solid ${accent}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        cursor: onOpenDetail ? 'pointer' : 'default',
      }}
    >
      <div style={{ minWidth: 0 }}>
        {sourceBadge && (
          <button
            type="button"
            disabled={!doc.email_id}
            onClick={e => {
              e.stopPropagation()
              if (doc.email_id) onOpenMail?.(doc.email_id)
            }}
            style={{
              fontSize: 10, fontWeight: 600, fontFamily: 'DM Sans, system-ui',
              padding: '2px 8px', borderRadius: 4, marginBottom: 6,
              display: 'inline-block', border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)', color: sourceBadge.color,
              cursor: doc.email_id ? 'pointer' : 'default',
            }}
          >
            {sourceBadge.label}
          </button>
        )}
        <div style={{
          fontSize: 10, fontWeight: 600, fontFamily: 'DM Sans, system-ui',
          padding: '2px 8px', borderRadius: 4, marginBottom: 6,
          display: 'inline-block', maxWidth: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          ...badgeStyle,
        }}>
          {title}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.is_png ? '🖼' : '📎'} {doc.filename}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
          {doc.date && (
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>
              {formatDate(doc.date)}
            </span>
          )}
          {versionCount && versionCount > 1 && (
            <span style={{
              fontSize: 10, fontWeight: 600, fontFamily: 'DM Sans, system-ui',
              padding: '1px 6px', borderRadius: 4,
              background: 'rgba(59,126,246,0.12)', color: 'var(--accent)',
              border: '1px solid rgba(59,126,246,0.2)',
            }}>
              {versionCount} version{versionCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        {doc.is_png && doc.email_id != null && doc.attachment_index != null && onExcludePng && !doc.is_optional && (
          <button
            type="button"
            disabled={excluding}
            onClick={e => {
              e.stopPropagation()
              onExcludePng(doc.email_id!, doc.attachment_index!)
            }}
            style={{
              fontSize: 11, color: '#f87171', background: 'transparent',
              border: '1px solid rgba(248,113,113,0.35)', borderRadius: 6,
              padding: '4px 10px', cursor: excluding ? 'wait' : 'pointer', fontFamily: 'DM Sans, system-ui',
            }}
          >
            {excluding ? '…' : 'Retirer'}
          </button>
        )}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            onDownload()
          }}
          style={{
            fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)',
            border: '1px solid rgba(59,126,246,0.2)', borderRadius: 6,
            padding: '4px 10px', cursor: 'pointer', flexShrink: 0, fontFamily: 'DM Sans, system-ui',
          }}
        >
          Télécharger
        </button>
      </div>
    </div>
  )
}

export default function TenderDocumentsTab({
  receivedDocs,
  sentDocs,
  optionalPngDocs,
  documentGroups,
  uploadingDoc,
  showOptionalPng,
  pngAttachmentAction,
  onUploadClick,
  onDownload,
  onOpenMail,
  onExcludePng,
  onIncludePng,
  onToggleOptionalPng,
}: {
  receivedDocs: DocRow[]
  sentDocs: DocRow[]
  optionalPngDocs: DocRow[]
  documentGroups: TenderDocumentGroup[]
  uploadingDoc: boolean
  showOptionalPng: boolean
  pngAttachmentAction: string | null
  onUploadClick: () => void
  onDownload: (docId: string, filename: string) => void
  onOpenMail?: (emailId: string) => void
  onExcludePng?: (emailId: string, attachmentIndex: number) => void
  onIncludePng?: (emailId: string, attachmentIndex: number) => void
  onToggleOptionalPng: () => void
}) {
  const [detailGroup, setDetailGroup] = useState<TenderDocumentGroup | null>(null)
  const [highlightDoc, setHighlightDoc] = useState<TenderDocumentItem | null>(null)

  const groupByDocId = new Map<string, TenderDocumentGroup>()
  for (const g of documentGroups) {
    for (const v of g.versions) {
      groupByDocId.set(v.id, g)
    }
  }

  const openDetail = (doc: DocRow) => {
    const group = groupByDocId.get(doc.id)
    if (group) {
      setHighlightDoc(doc as TenderDocumentItem)
      setDetailGroup(group)
    } else {
      const singleGroup: TenderDocumentGroup = {
        base_name: doc.filename,
        label: doc.filename,
        versions: [{ ...(doc as TenderDocumentItem), version_number: 1 }],
        latest: doc as TenderDocumentItem,
        version_count: 1,
      }
      setHighlightDoc(doc as TenderDocumentItem)
      setDetailGroup(singleGroup)
    }
  }

  const handleDownloadDoc = (doc: TenderDocumentItem) => {
    onDownload(doc.id, doc.filename)
  }

  const hasDocs = receivedDocs.length > 0 || sentDocs.length > 0 || optionalPngDocs.length > 0

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Documents & pièces jointes
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="ghost" loading={uploadingDoc} onClick={onUploadClick}>
            + Ajouter un document
          </Button>
        </div>
      </div>

      {!hasDocs ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
          Aucun document — demande AO, devis fournisseurs et PJ de consultation apparaîtront ici
        </div>
      ) : (
        <>
          {documentGroups.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
              }}>
                Suivi par document ({documentGroups.length})
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                Dernière version visible — cliquez pour l&apos;historique (v1, v2, v3…)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {documentGroups.map(group => (
                  <TenderDocumentRow
                    key={group.base_name}
                    doc={group.latest}
                    versionCount={group.version_count}
                    onOpenDetail={() => {
                      setHighlightDoc(group.latest)
                      setDetailGroup(group)
                    }}
                    onDownload={() => onDownload(group.latest.id, group.latest.filename)}
                    onOpenMail={onOpenMail}
                  />
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div>
              <div style={{
                fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
              }}>
                Reçus ({receivedDocs.length})
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                Demande AO (DCE, CCTP…) et devis fournisseurs
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {receivedDocs.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune PJ reçue</span>
                ) : receivedDocs.map(doc => (
                  <TenderDocumentRow
                    key={doc.id}
                    doc={doc}
                    versionCount={groupByDocId.get(doc.id)?.version_count}
                    onOpenDetail={() => openDetail(doc)}
                    onDownload={() => onDownload(doc.id, doc.filename)}
                    onOpenMail={onOpenMail}
                    onExcludePng={onExcludePng}
                    excluding={pngAttachmentAction === `exclude:${doc.email_id}:${doc.attachment_index}`}
                  />
                ))}
              </div>
            </div>
            <div>
              <div style={{
                fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
              }}>
                Envoyés ({sentDocs.length})
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                PJ transmises aux fournisseurs (consultation)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sentDocs.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune PJ envoyée</span>
                ) : sentDocs.map(doc => (
                  <TenderDocumentRow
                    key={doc.id}
                    doc={doc}
                    versionCount={groupByDocId.get(doc.id)?.version_count}
                    onOpenDetail={() => openDetail(doc)}
                    onDownload={() => onDownload(doc.id, doc.filename)}
                    onOpenMail={onOpenMail}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {optionalPngDocs.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={onToggleOptionalPng}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
              border: '1px dashed var(--border-hi)', background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)', fontFamily: 'DM Sans, system-ui', fontSize: 12,
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{showOptionalPng ? '▼' : '▶'}</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Images PNG des mails ({optionalPngDocs.length})
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              — logos / signatures, non intégrées par défaut
            </span>
          </button>
          {showOptionalPng && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {optionalPngDocs.map(doc => {
                const includeKey = `include:${doc.email_id}:${doc.attachment_index}`
                const excludeKey = `exclude:${doc.email_id}:${doc.attachment_index}`
                const busy = pngAttachmentAction === includeKey || pngAttachmentAction === excludeKey
                return (
                  <div
                    key={doc.id}
                    style={{
                      padding: '10px 12px', background: 'var(--bg-secondary)',
                      border: '1px dashed rgba(59,126,246,0.25)', borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                        🖼 {doc.filename}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                        {formatFileSize(doc.size)}
                        {doc.supplier_name ? ` · ${doc.supplier_name}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDownload(doc.id, doc.filename)}
                        style={{
                          fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)',
                          border: '1px solid rgba(59,126,246,0.2)', borderRadius: 6,
                          padding: '4px 10px', cursor: busy ? 'wait' : 'pointer', fontFamily: 'DM Sans, system-ui',
                        }}
                      >
                        Voir
                      </button>
                      {onIncludePng && (
                        <button
                          type="button"
                          disabled={busy || !doc.email_id}
                          onClick={() => onIncludePng(doc.email_id!, doc.attachment_index!)}
                          style={{
                            fontSize: 11, color: '#4ade80', background: 'rgba(74,222,128,0.12)',
                            border: '1px solid rgba(74,222,128,0.35)', borderRadius: 6,
                            padding: '4px 10px', cursor: busy ? 'wait' : 'pointer', fontFamily: 'DM Sans, system-ui',
                          }}
                        >
                          {pngAttachmentAction === includeKey ? '…' : 'Intégrer'}
                        </button>
                      )}
                      {onExcludePng && (
                        <button
                          type="button"
                          disabled={busy || !doc.email_id}
                          onClick={() => onExcludePng(doc.email_id!, doc.attachment_index!)}
                          style={{
                            fontSize: 11, color: '#f87171', background: 'transparent',
                            border: '1px solid rgba(248,113,113,0.35)', borderRadius: 6,
                            padding: '4px 10px', cursor: busy ? 'wait' : 'pointer', fontFamily: 'DM Sans, system-ui',
                          }}
                        >
                          {pngAttachmentAction === excludeKey ? '…' : 'Ignorer'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {detailGroup && (
        <DocumentDetailModal
          group={detailGroup}
          highlightDoc={highlightDoc ?? undefined}
          onClose={() => {
            setDetailGroup(null)
            setHighlightDoc(null)
          }}
          onDownload={handleDownloadDoc}
          onOpenMail={onOpenMail}
        />
      )}
    </>
  )
}
