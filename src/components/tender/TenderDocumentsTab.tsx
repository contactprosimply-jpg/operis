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
    case 'manual_import':
      return { background: 'rgba(168,85,247,0.14)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }
    default:
      return { background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
  }
}

function versionAccentColor(doc: TenderDocumentItem): string {
  if (doc.kind === 'imported') return '#c084fc'
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

const docTextBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  color: 'var(--accent)',
  background: 'var(--accent-soft)',
  border: '1px solid rgba(59,126,246,0.2)',
  borderRadius: 6,
  padding: '4px 10px',
  cursor: 'pointer',
  flexShrink: 0,
  fontFamily: 'DM Sans, system-ui',
  minHeight: 32,
}

function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export function DocumentFileActions({
  onOpen,
  onDownload,
}: {
  onOpen: () => void
  onDownload: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
      <button type="button" title="Voir" aria-label="Voir" onClick={onOpen} style={docTextBtn}>
        <IconEye />
        Voir
      </button>
      <button type="button" title="Télécharger" aria-label="Télécharger" onClick={onDownload} style={docTextBtn}>
        <IconDownload />
        Télécharger
      </button>
    </div>
  )
}

function versionDirectionLabel(doc: TenderDocumentItem) {
  if (doc.kind === 'imported') {
    return `Importé · ${doc.imported_by_name?.trim() || 'un membre'}`
  }
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
  imported_by_name?: string | null
}

function DocumentVersionTimeline({
  versions,
  onDownload,
  onOpen,
  onOpenMail,
  highlightId,
}: {
  versions: TenderDocumentVersion[]
  onDownload: (doc: TenderDocumentItem) => void
  onOpen: (doc: TenderDocumentItem) => void
  onOpenMail?: (emailId: string) => void
  highlightId?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: '100%', maxWidth: '100%', minWidth: 0 }}>
      {versions.map((v, idx) => {
        const accent = versionAccentColor(v)
        const isLast = idx === versions.length - 1
        const isHighlight = highlightId === v.id
        const badgeStyle = documentCategoryStyle(v.category)
        const sourceBadge = mailSourceBadge(v.mail_source)

        return (
          <div key={v.id} style={{ display: 'flex', gap: 12, minHeight: 72, width: '100%', minWidth: 0 }}>
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
              flex: 1,
              minWidth: 0,
              maxWidth: '100%',
              marginBottom: isLast ? 0 : 12,
              padding: '10px 12px',
              borderRadius: 8,
              boxSizing: 'border-box',
              border: isHighlight ? `1px solid ${accent}` : '1px solid var(--border)',
              borderLeftWidth: 3,
              borderLeftColor: accent,
              background: isHighlight ? `${accent}0d` : 'var(--bg-secondary)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono, monospace',
                  color: accent, letterSpacing: '0.04em', flexShrink: 0,
                }}>
                  v{v.version_number}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, fontFamily: 'DM Sans, system-ui',
                  color: accent,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {versionDirectionLabel(v)}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {formatDate(v.date)}
                </span>
              </div>
              {v.display_title && (
                <div style={{
                  fontSize: 10, fontWeight: 600, fontFamily: 'DM Sans, system-ui',
                  padding: '2px 8px', borderRadius: 4, marginBottom: 6,
                  display: 'block', maxWidth: '100%', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  ...badgeStyle,
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
              <div style={{
                fontSize: 10, color: 'var(--text-muted)', marginTop: 4,
                fontFamily: 'DM Mono, monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
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
                <DocumentFileActions
                  onOpen={() => onOpen(v)}
                  onDownload={() => onDownload(v)}
                />
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
  onOpen,
  onOpenMail,
}: {
  group: TenderDocumentGroup
  highlightDoc?: TenderDocumentItem
  onClose: () => void
  onDownload: (doc: TenderDocumentItem) => void
  onOpen: (doc: TenderDocumentItem) => void
  onOpenMail?: (emailId: string) => void
}) {
  const latest = group.latest
  return (
    <Modal open onClose={onClose} title={group.label} size="lg">
      <div style={{ width: '100%', minWidth: 0 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            {group.version_count} version{group.version_count > 1 ? 's' : ''} · dernière : {formatDate(latest.date)}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box',
            background: `${versionAccentColor(latest)}14`,
            border: `1px solid ${versionAccentColor(latest)}40`,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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
          onOpen={onOpen}
          onOpenMail={onOpenMail}
          highlightId={highlightDoc?.id ?? latest.id}
        />
      </div>
    </Modal>
  )
}

const AOD_FILTERS = ['tous', 'received', 'sent', 'imported'] as const
type AodFilter = (typeof AOD_FILTERS)[number]
const AOD_FILTER_LABEL: Record<AodFilter, string> = { tous: 'Tous', received: 'Reçus', sent: 'Envoyés', imported: 'Importés' }

function fileTypeTag(filename: string): { label: string; cls: string } {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return { label: 'PDF', cls: 'aod-filetype--pdf' }
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return { label: ext.replace(/x$/, '').toUpperCase(), cls: 'aod-filetype--doc' }
  return { label: (ext || 'FILE').toUpperCase().slice(0, 4), cls: 'aod-filetype--doc' }
}

function sensPill(kind: DocRow['kind']) {
  if (kind === 'received') return { label: 'Reçu', cls: 'aod-sens-pill--received' }
  if (kind === 'sent') return { label: 'Envoyé', cls: 'aod-sens-pill--sent' }
  return { label: 'Importé', cls: 'aod-sens-pill--imported' }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '').concat(parts[1]?.[0] ?? '').toUpperCase() || '—'
}

function AodPerson({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="aod-person">
      <div className="ao-avatar">{initials(name)}</div>
      <div style={{ minWidth: 0 }}>
        <div className="aod-person-name">{name}</div>
        {sub && <div className="aod-person-sub">{sub}</div>}
      </div>
    </div>
  )
}

function fromCell(doc: DocRow) {
  if (doc.kind === 'received') return <AodPerson name={doc.supplier_name?.trim() || 'Expéditeur inconnu'} sub={doc.received_by_name ? `→ ${doc.received_by_name}` : undefined} />
  if (doc.kind === 'sent') return <AodPerson name={doc.sent_by_name?.trim() || 'Membre de l’équipe'} sub="Membre de l'équipe" />
  return <AodPerson name={doc.imported_by_name?.trim() || 'Membre de l’équipe'} sub="Membre de l'équipe" />
}

function toCell(doc: DocRow) {
  if (doc.kind === 'sent') {
    const list = doc.sent_to_suppliers ?? (doc.supplier_name ? [doc.supplier_name] : [])
    if (list.length === 0) return <span style={{ color: 'var(--db-text-2)', fontSize: 13 }}>—</span>
    if (list.length === 1) return <AodPerson name={list[0]} />
    return <AodPerson name={`${list.length} fournisseurs`} sub={list.join(', ')} />
  }
  if (doc.kind === 'received') {
    return doc.received_by_name ? <AodPerson name={doc.received_by_name} sub="Membre de l'équipe" /> : <span style={{ color: 'var(--db-text-2)', fontSize: 13 }}>—</span>
  }
  return <span style={{ color: 'var(--db-text-2)', fontSize: 13 }}>—</span>
}

export default function TenderDocumentsTab({
  receivedDocs,
  sentDocs,
  importedDocs,
  optionalPngDocs,
  documentGroups,
  uploadingDoc,
  showOptionalPng,
  pngAttachmentAction,
  onUploadClick,
  onOpen,
  onDownload,
  onOpenMail,
  onExcludePng,
  onIncludePng,
  onToggleOptionalPng,
}: {
  receivedDocs: DocRow[]
  sentDocs: DocRow[]
  importedDocs: DocRow[]
  optionalPngDocs: DocRow[]
  documentGroups: TenderDocumentGroup[]
  uploadingDoc: boolean
  showOptionalPng: boolean
  pngAttachmentAction: string | null
  onUploadClick: () => void
  onOpen: (docId: string, filename: string, contentType?: string) => void
  onDownload: (docId: string, filename: string, contentType?: string) => void
  onOpenMail?: (emailId: string) => void
  onExcludePng?: (emailId: string, attachmentIndex: number) => void
  onIncludePng?: (emailId: string, attachmentIndex: number) => void
  onToggleOptionalPng: () => void
}) {
  const [detailGroup, setDetailGroup] = useState<TenderDocumentGroup | null>(null)
  const [highlightDoc, setHighlightDoc] = useState<TenderDocumentItem | null>(null)
  const [filter, setFilter] = useState<AodFilter>('tous')
  const [search, setSearch] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<DocRow | null>(null)

  const groupByDocId = new Map<string, TenderDocumentGroup>()
  for (const g of documentGroups) {
    for (const v of g.versions) {
      groupByDocId.set(v.id, g)
    }
  }

  const allDocs: DocRow[] = [...receivedDocs, ...sentDocs, ...importedDocs].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0
    const db = b.date ? new Date(b.date).getTime() : 0
    return db - da
  })

  const searchLower = search.trim().toLowerCase()
  const visibleDocs = allDocs
    .filter(d => filter === 'tous' || d.kind === filter)
    .filter(d => !searchLower || [d.filename, d.supplier_name, d.sent_by_name, d.received_by_name, d.imported_by_name]
      .some(v => v?.toLowerCase().includes(searchLower)))

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
    onDownload(doc.id, doc.filename, doc.contentType)
  }

  const handleOpenDoc = (doc: TenderDocumentItem) => {
    onOpen(doc.id, doc.filename, doc.contentType)
  }

  const selectRow = (doc: DocRow) => {
    setSelectedDoc(doc)
    // Sous 1024px la colonne latérale est masquée (CSS) : la modale reste le repli d'accès au détail.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      openDetail(doc)
    }
  }

  const hasDocs = allDocs.length > 0
  const selectedGroup = selectedDoc ? groupByDocId.get(selectedDoc.id) : undefined

  return (
    <>
      <div className="aod-layout">
        <div className="aod-main">
          <div className="aod-toolbar">
            {AOD_FILTERS.map(f => {
              const count = f === 'tous' ? allDocs.length : f === 'received' ? receivedDocs.length : f === 'sent' ? sentDocs.length : importedDocs.length
              return (
                <button key={f} type="button" className="aol-pill" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {AOD_FILTER_LABEL[f]} <span>· {count}</span>
                </button>
              )
            })}
            <span style={{ flexGrow: 1 }} />
            <label className="aod-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="text" placeholder="Nom, expéditeur…" aria-label="Rechercher un document" value={search} onChange={e => setSearch(e.target.value)} />
            </label>
            <Button variant="ghost" loading={uploadingDoc} onClick={onUploadClick}>+ Ajouter</Button>
          </div>

          {!hasDocs ? (
            <div className="aod-table-card" style={{ fontSize: 12, color: 'var(--db-text-2)', textAlign: 'center', padding: 24 }}>
              Aucun document — demande AO, devis fournisseurs et PJ de consultation apparaîtront ici
            </div>
          ) : (
            <div className="aod-table-card">
              <div className="aod-thead" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) 104px minmax(0, 1.5fr) minmax(0, 1.5fr) 110px', gap: 14, padding: '11px 20px' }}>
                <span>Document</span><span>Sens</span><span>De / par</span><span>À</span><span>Date</span>
              </div>
              {visibleDocs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--db-text-2)' }}>Aucun document pour ce filtre</div>
              ) : visibleDocs.map(doc => {
                const versionCount = groupByDocId.get(doc.id)?.version_count
                const ft = fileTypeTag(doc.filename)
                const sens = sensPill(doc.kind)
                return (
                  <div
                    key={doc.id}
                    role="button"
                    tabIndex={0}
                    data-selected={selectedDoc?.id === doc.id}
                    className="aod-row"
                    onClick={() => selectRow(doc)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') selectRow(doc) }}
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) 104px minmax(0, 1.5fr) minmax(0, 1.5fr) 110px', gap: 14, padding: '13px 20px', alignItems: 'center' }}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                      <span className={`aod-filetype ${ft.cls}`} style={{ marginTop: 2 }}>{ft.label}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--db-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.filename}</div>
                        <div style={{ fontSize: 11, color: 'var(--db-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {formatFileSize(doc.size)}{doc.label ? ` · ${doc.label}` : ''}{versionCount && versionCount > 1 ? ` · ${versionCount} versions` : ''}
                        </div>
                      </div>
                    </div>
                    <div><span className={`aod-sens-pill ${sens.cls}`}>{sens.label}</span></div>
                    <div>{fromCell(doc)}</div>
                    <div>{toCell(doc)}</div>
                    <div style={{ fontSize: 13, color: 'var(--db-text-2)' }}>{formatDate(doc.date)}</div>
                  </div>
                )
              })}
            </div>
          )}

          <button type="button" className="aod-dropzone" onClick={onUploadClick} style={{ border: 'none', width: '100%' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
            Glissez un fichier ici pour l&apos;ajouter à cet AO <span style={{ color: 'var(--db-text-2)', fontWeight: 500 }}>· jusqu&apos;à 30 Mo</span>
          </button>
        </div>

        <aside className="aod-side">
          {selectedDoc ? (
            <>
              <div className="aod-side-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="ao-side-label">Document sélectionné</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6, color: 'var(--db-text)', wordBreak: 'break-all' }}>{selectedDoc.filename}</div>
                    <div style={{ fontSize: 12, color: 'var(--db-text-2)', marginTop: 2 }}>{formatFileSize(selectedDoc.size)} · {fileTypeTag(selectedDoc.filename).label}</div>
                  </div>
                  <span className={`aod-sens-pill ${sensPill(selectedDoc.kind).cls}`}>{sensPill(selectedDoc.kind).label}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button type="button" className="ao-btn" style={{ flexGrow: 1, justifyContent: 'center' }} onClick={() => onOpen(selectedDoc.id, selectedDoc.filename, selectedDoc.contentType)}>Ouvrir</button>
                  <button type="button" className="ao-btn" style={{ flexGrow: 1, justifyContent: 'center' }} onClick={() => onDownload(selectedDoc.id, selectedDoc.filename, selectedDoc.contentType)}>Télécharger</button>
                </div>
                {selectedDoc.email_id && (
                  <button type="button" className="ao-btn" style={{ width: '100%', marginTop: 8, justifyContent: 'center', background: 'var(--db-accent-bg)', color: 'var(--db-accent-text)', border: 'none' }} onClick={() => onOpenMail?.(selectedDoc.email_id!)}>
                    Voir le mail d&apos;origine
                  </button>
                )}
              </div>

              {selectedGroup && (
                <div className="aod-side-card">
                  <div className="ao-side-label" style={{ marginBottom: 14 }}>Historique du document</div>
                  <DocumentVersionTimeline
                    versions={selectedGroup.versions}
                    onDownload={handleDownloadDoc}
                    onOpen={handleOpenDoc}
                    onOpenMail={onOpenMail}
                    highlightId={selectedDoc.id}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="aod-side-card" style={{ fontSize: 12, color: 'var(--db-text-2)', textAlign: 'center' }}>
              Sélectionnez un document pour voir son détail et son historique.
            </div>
          )}
        </aside>
      </div>

      {optionalPngDocs.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--db-border)' }}>
          <button
            type="button"
            onClick={onToggleOptionalPng}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
              border: '1px dashed var(--db-border)', background: 'var(--db-family-bg)',
              color: 'var(--db-text-2)', fontFamily: 'DM Sans, system-ui', fontSize: 12,
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--db-text-2)' }}>{showOptionalPng ? '▼' : '▶'}</span>
            <span style={{ fontWeight: 600, color: 'var(--db-text)' }}>
              Images PNG des mails ({optionalPngDocs.length})
            </span>
            <span style={{ fontSize: 11, color: 'var(--db-text-2)' }}>
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
                      padding: '10px 12px', background: 'var(--db-family-bg)',
                      border: '1px dashed var(--db-accent)', borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--db-text)' }}>
                        🖼 {doc.filename}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--db-text-2)', fontFamily: 'DM Mono, monospace' }}>
                        {formatFileSize(doc.size)}
                        {doc.supplier_name ? ` · ${doc.supplier_name}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      <DocumentFileActions
                        onOpen={() => onOpen(doc.id, doc.filename, doc.contentType)}
                        onDownload={() => onDownload(doc.id, doc.filename, doc.contentType)}
                      />
                      {onIncludePng && (
                        <button
                          type="button"
                          disabled={busy || !doc.email_id}
                          onClick={() => onIncludePng(doc.email_id!, doc.attachment_index!)}
                          style={{
                            fontSize: 11, color: 'var(--db-green-text)', background: 'var(--db-green-bg)',
                            border: '1px solid var(--db-green)', borderRadius: 6,
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
                            fontSize: 11, color: 'var(--db-red)', background: 'transparent',
                            border: '1px solid var(--db-red)', borderRadius: 6,
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
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      <DocumentFileActions
                        onOpen={() => onOpen(doc.id, doc.filename, doc.contentType)}
                        onDownload={() => onDownload(doc.id, doc.filename, doc.contentType)}
                      />
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
          onOpen={handleOpenDoc}
          onOpenMail={onOpenMail}
        />
      )}
    </>
  )
}
