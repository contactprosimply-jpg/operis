'use client'

export default function MailToolbar({
  onNewMail,
  onRefresh,
  syncing,
  lastSyncLabel,
  search,
  onSearchChange,
  listFilter,
  onListFilterChange,
  showAoFilter,
}: {
  onNewMail: () => void
  onRefresh: () => void
  syncing: boolean
  lastSyncLabel: string
  search: string
  onSearchChange: (v: string) => void
  listFilter: 'all' | 'unread' | 'attachments'
  onListFilterChange: (f: 'all' | 'unread' | 'attachments') => void
  showAoFilter?: boolean
}) {
  const filters: Array<{ key: 'all' | 'unread' | 'attachments'; label: string }> = [
    { key: 'all', label: 'Tous' },
    { key: 'unread', label: 'Non lus' },
    { key: 'attachments', label: 'PJ' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={onNewMail}
        style={{
          padding: '6px 14px',
          borderRadius: 8,
          border: 'none',
          background: '#021246',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'DM Sans, system-ui',
        }}
      >
        + Nouveau
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={syncing}
        style={{
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontSize: 12,
          cursor: syncing ? 'wait' : 'pointer',
          fontFamily: 'DM Sans, system-ui',
        }}
      >
        {syncing ? '↻ Sync…' : '↻ Rafraîchir'}
      </button>
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          fontFamily: 'DM Mono, monospace',
          whiteSpace: 'nowrap',
        }}
      >
        {lastSyncLabel}
      </span>
      <div style={{ flex: 1, minWidth: 120 }}>
        <input
          type="search"
          placeholder="Rechercher…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          style={{
            width: '100%',
            maxWidth: 280,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontFamily: 'DM Sans, system-ui',
          }}
        />
      </div>
      {showAoFilter && (
        <div style={{ display: 'flex', gap: 4 }}>
          {filters.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => onListFilterChange(f.key)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: listFilter === f.key ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: listFilter === f.key ? 'var(--accent-soft)' : 'transparent',
                color: listFilter === f.key ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'DM Sans, system-ui',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
