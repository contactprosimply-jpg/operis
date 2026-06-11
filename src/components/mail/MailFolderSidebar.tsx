'use client'

import type { MailFolder } from '@/lib/mail-folders'

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

function IconMailLock({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" width="16" height="16">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
      <rect x="15" y="1" width="8" height="6" rx="1" fill="var(--mail-sidebar-bg)" stroke={color} />
    </svg>
  )
}

const FOLDER_META: Record<MailFolder, { label: string; color: string; Icon: typeof IconInbox }> = {
  inbox: { label: 'Courrier entrant', color: '#22c55e', Icon: IconInbox },
  drafts: { label: 'Brouillons', color: '#22c55e', Icon: IconDraft },
  sent: { label: 'Envoyés', color: '#22c55e', Icon: IconSent },
  spam: { label: 'Indésirables', color: '#ef4444', Icon: IconSpam },
  trash: { label: 'Corbeille', color: '#94a3b8', Icon: IconTrash },
}

export default function MailFolderSidebar({
  accountEmail,
  folder,
  onFolderChange,
  onCompose,
  onSync,
  syncing,
  badges,
  collapsed,
}: {
  accountEmail: string | null
  folder: MailFolder
  onFolderChange: (f: MailFolder) => void
  onCompose: () => void
  onSync: () => void
  syncing: boolean
  badges: Partial<Record<MailFolder, number>>
  collapsed?: boolean
}) {
  const folders: MailFolder[] = ['inbox', 'drafts', 'sent', 'spam', 'trash']

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
            background: 'linear-gradient(135deg, #3b7ef6 0%, #6366f1 100%)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(59,126,246,0.35)',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          {!collapsed && <span>Nouveau message</span>}
        </button>
      </div>

      {!collapsed && accountEmail && (
        <div
          style={{
            padding: '8px 14px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#7dd3fc',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 4,
          }}
        >
          <IconMailLock color="#7dd3fc" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{accountEmail}</span>
        </div>
      )}

      <nav style={{ flex: 1, padding: '6px 8px', overflowY: 'auto' }}>
        {folders.map(id => {
          const meta = FOLDER_META[id]
          const active = folder === id
          const badge = badges[id]
          return (
            <button
              key={id}
              type="button"
              onClick={() => onFolderChange(id)}
              title={collapsed ? meta.label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: collapsed ? '10px 8px' : '10px 12px',
                marginBottom: 2,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: active ? 'rgba(59,126,246,0.22)' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.82)',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                justifyContent: collapsed ? 'center' : 'flex-start',
                transition: 'background 0.15s',
              }}
            >
              <meta.Icon color={meta.color} />
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left' }}>{meta.label}</span>
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
          )
        })}
      </nav>

      {!collapsed && (
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
              fontFamily: 'DM Sans, system-ui',
            }}
          >
            {syncing ? 'Synchronisation…' : '↻ Synchroniser'}
          </button>
        </div>
      )}
    </aside>
  )
}
