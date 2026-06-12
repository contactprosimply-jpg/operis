'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  type MailFolderKind,
  type MailFolderSelection,
  FOLDER_LABELS,
  folderSelectionKey,
  customFolderLabel,
  buildFolderTree,
  type CachedImapFolder,
  type FolderTreeNode,
} from '@/lib/mail-folders'

function IconInbox({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" width="18" height="18">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  )
}

function IconDraft({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" width="18" height="18">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function IconSent({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" width="18" height="18">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function IconSpam({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill={color} width="18" height="18">
      <path d="M12 2C8.5 2 6 4.5 6 8c0 4 2 7 6 12 4-5 6-8 6-12 0-3.5-2.5-6-6-6zm0 8a2 2 0 110-4 2 2 0 010 4z" opacity="0.9" />
    </svg>
  )
}

function IconTrash({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" width="18" height="18">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  )
}

function IconFolder({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" width="18" height="18">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  )
}

function IconMailLock({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" width="16" height="16">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
      <rect x="15" y="1" width="8" height="6" rx="1" fill="var(--mail-sidebar-bg)" stroke={color} />
    </svg>
  )
}

const FOLDER_ICONS: Record<MailFolderKind, { color: string; Icon: typeof IconInbox }> = {
  inbox: { color: '#22c55e', Icon: IconInbox },
  drafts: { color: '#22c55e', Icon: IconDraft },
  sent: { color: '#22c55e', Icon: IconSent },
  spam: { color: '#ef4444', Icon: IconSpam },
  trash: { color: '#94a3b8', Icon: IconTrash },
  custom: { color: '#60a5fa', Icon: IconFolder },
}

const STANDARD_ORDER: MailFolderKind[] = ['inbox', 'drafts', 'sent', 'spam', 'trash']

const FOLDERS_SECTION_KEY = 'operis-mail-folders-section-open'

export default function MailFolderSidebar({
  accounts,
  accountEmail,
  selection,
  onSelectionChange,
  onCompose,
  onSync,
  syncing = false,
  badges,
  customFolders,
  collapsed,
  onCreateFolder,
  onDeleteFolder,
  folderActionLoading = false,
}: {
  accounts: Array<{ id: string; email: string }>
  accountEmail: string | null
  selection: MailFolderSelection
  onSelectionChange: (s: MailFolderSelection) => void
  onCompose?: () => void
  onSync?: () => void
  syncing?: boolean
  badges: Partial<Record<string, number>>
  customFolders: CachedImapFolder[]
  collapsed?: boolean
  onCreateFolder?: (name: string, parentPath?: string) => Promise<boolean>
  onDeleteFolder?: (path: string) => Promise<boolean>
  folderActionLoading?: boolean
}) {
  const activeKey = folderSelectionKey(selection)
  const folderTree = useMemo(() => buildFolderTree(customFolders), [customFolders])

  const [sectionOpen, setSectionOpen] = useState(true)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [createParentPath, setCreateParentPath] = useState<string | undefined>(undefined)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FOLDERS_SECTION_KEY)
      if (stored === '0') setSectionOpen(false)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (folderTree.length) {
      setExpandedNodes(prev => {
        const next = new Set(prev)
        folderTree.forEach(n => {
          if (n.children.length) next.add(n.path)
        })
        return next
      })
    }
  }, [folderTree])

  const toggleSection = () => {
    setSectionOpen(prev => {
      const next = !prev
      try { localStorage.setItem(FOLDERS_SECTION_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  const toggleNode = (path: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const submitCreateFolder = async () => {
    if (!onCreateFolder || !newFolderName.trim()) return
    const ok = await onCreateFolder(newFolderName.trim(), createParentPath)
    if (ok) {
      setNewFolderName('')
      setCreateParentPath(undefined)
      setShowCreateForm(false)
      setSectionOpen(true)
    }
  }

  const renderItem = (
    key: string,
    label: string,
    Icon: typeof IconInbox,
    color: string,
    onClick: () => void,
    depth = 0,
    onDelete?: () => void,
    hasChildren = false,
    nodeExpanded = false,
    onToggleExpand?: () => void,
  ) => {
    const active = activeKey === key
    const badge = badges[key]
    const showDelete = onDelete && hoveredPath === key

    return (
      <div
        key={key}
        style={{ display: 'flex', alignItems: 'center', marginBottom: 2, paddingLeft: depth > 0 ? depth * 12 : 0 }}
        onMouseEnter={() => setHoveredPath(key)}
        onMouseLeave={() => setHoveredPath(prev => prev === key ? null : prev)}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggleExpand}
            title={nodeExpanded ? 'Réduire' : 'Développer'}
            style={{
              width: 22,
              height: 32,
              flexShrink: 0,
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer',
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {nodeExpanded ? '▾' : '▸'}
          </button>
        ) : depth > 0 ? (
          <span style={{ width: 22, flexShrink: 0 }} />
        ) : null}
        <button
          type="button"
          onClick={onClick}
          title={collapsed ? label : undefined}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: collapsed ? '10px 8px' : '8px 10px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: active ? 'rgba(59,126,246,0.22)' : 'transparent',
            color: active ? '#fff' : 'rgba(255,255,255,0.82)',
            fontSize: 13,
            fontWeight: active ? 600 : 400,
            justifyContent: collapsed ? 'center' : 'flex-start',
            minWidth: 0,
          }}
        >
          <Icon color={color} />
          {!collapsed && (
            <>
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label}
              </span>
              {badge != null && badge > 0 && (
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    padding: '0 6px',
                    borderRadius: 11,
                    background: '#fff',
                    color: '#111',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'DM Mono, monospace',
                  }}
                >
                  {badge}
                </span>
              )}
            </>
          )}
        </button>
        {!collapsed && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={folderActionLoading}
            title="Supprimer le dossier"
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              border: 'none',
              borderRadius: 6,
              background: showDelete ? 'rgba(239,68,68,0.2)' : 'transparent',
              color: showDelete ? '#fca5a5' : 'transparent',
              cursor: folderActionLoading ? 'wait' : 'pointer',
              fontSize: 13,
              opacity: showDelete ? 1 : 0,
              transition: 'opacity 0.15s',
            }}
          >
            ×
          </button>
        )}
      </div>
    )
  }

  const renderTreeNode = (node: FolderTreeNode, depth = 0) => {
    const key = `custom:${node.path}`
    const hasChildren = node.children.length > 0
    const nodeExpanded = expandedNodes.has(node.path)

    return (
      <div key={node.path}>
        {renderItem(
          key,
          node.name,
          IconFolder,
          '#60a5fa',
          () => onSelectionChange({ kind: 'custom', customPath: node.path }),
          depth,
          onDeleteFolder
            ? () => {
                const label = node.name || customFolderLabel(node.path)
                if (!confirm(`Supprimer le dossier « ${label} » ?\n\nTous les messages du dossier seront supprimés du serveur.`)) return
                void onDeleteFolder(node.path)
              }
            : undefined,
          hasChildren,
          nodeExpanded,
          hasChildren ? () => toggleNode(node.path) : undefined,
        )}
        {hasChildren && nodeExpanded && node.children.map(child => renderTreeNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <aside
      style={{
        width: collapsed ? 56 : 220,
        flexShrink: 0,
        background: 'var(--mail-sidebar-bg, #12151c)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        color: '#e8eaef',
        fontFamily: 'DM Sans, system-ui',
      }}
    >
      {onCompose && (
        <div style={{ padding: collapsed ? '12px 8px' : '14px 12px 10px' }}>
          <button
            type="button"
            onClick={onCompose}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8,
              padding: collapsed ? '10px' : '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #021246 0%, #3b7ef6 100%)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            {!collapsed && <span>Nouveau message</span>}
          </button>
        </div>
      )}

      {!collapsed && (accounts.length > 0 || accountEmail) && (
        <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
            Comptes
          </div>
          {(accounts.length ? accounts : [{ id: 'primary', email: accountEmail ?? '' }]).map(acc => (
            <div
              key={acc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#7dd3fc',
                marginBottom: 4,
              }}
            >
              <IconMailLock color="#7dd3fc" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.email}</span>
            </div>
          ))}
        </div>
      )}

      <nav style={{ flex: 1, padding: '6px 8px', overflowY: 'auto' }}>
        {STANDARD_ORDER.map(kind => {
          const meta = FOLDER_ICONS[kind]
          return renderItem(
            kind,
            FOLDER_LABELS[kind],
            meta.Icon,
            meta.color,
            () => onSelectionChange({ kind }),
          )
        })}

        {!collapsed && (customFolders.length > 0 || onCreateFolder) && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 4px 6px',
              }}
            >
              <button
                type="button"
                onClick={toggleSection}
                title={sectionOpen ? 'Masquer les dossiers' : 'Afficher les dossiers'}
                style={{
                  width: 22,
                  height: 22,
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.45)',
                  cursor: 'pointer',
                  fontSize: 10,
                  flexShrink: 0,
                }}
              >
                {sectionOpen ? '▾' : '▸'}
              </button>
              <span
                style={{
                  flex: 1,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'rgba(255,255,255,0.4)',
                }}
              >
                Dossiers
                {customFolders.length > 0 && (
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>({customFolders.length})</span>
                )}
              </span>
              {onCreateFolder && (
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(prev => !prev)
                    setCreateParentPath(undefined)
                    setSectionOpen(true)
                  }}
                  disabled={folderActionLoading}
                  title="Créer un dossier"
                  style={{
                    width: 24,
                    height: 24,
                    border: 'none',
                    borderRadius: 6,
                    background: showCreateForm ? 'rgba(59,126,246,0.25)' : 'rgba(255,255,255,0.08)',
                    color: '#7dd3fc',
                    cursor: folderActionLoading ? 'wait' : 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  +
                </button>
              )}
            </div>

            {showCreateForm && onCreateFolder && (
              <div style={{ padding: '4px 8px 8px' }}>
                {createParentPath && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                    Dans : {customFolderLabel(createParentPath)}
                  </div>
                )}
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="Nom du dossier"
                  maxLength={80}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void submitCreateFolder()
                    if (e.key === 'Escape') setShowCreateForm(false)
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e8eaef',
                    fontSize: 12,
                    marginBottom: 6,
                    outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => void submitCreateFolder()}
                    disabled={!newFolderName.trim() || folderActionLoading}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: 7,
                      border: 'none',
                      background: 'linear-gradient(135deg, #3b7ef6 0%, #6366f1 100%)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: folderActionLoading ? 'wait' : 'pointer',
                      opacity: !newFolderName.trim() ? 0.5 : 1,
                    }}
                  >
                    Créer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false)
                      setNewFolderName('')
                      setCreateParentPath(undefined)
                    }}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 7,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.65)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {sectionOpen && folderTree.map(node => renderTreeNode(node))}

            {sectionOpen && customFolders.length === 0 && !showCreateForm && (
              <div style={{ padding: '8px 12px', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                Aucun dossier personnalisé
              </div>
            )}
          </div>
        )}
      </nav>

      {onSync && !collapsed && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.65)',
              fontSize: 12,
              cursor: syncing ? 'wait' : 'pointer',
            }}
          >
            {syncing ? 'Synchronisation…' : '↻ Synchroniser'}
          </button>
        </div>
      )}
    </aside>
  )
}
