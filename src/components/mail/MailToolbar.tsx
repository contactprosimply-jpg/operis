'use client'

import type { MailSyncProgressUI } from '@/lib/mail-sync-progress'
import { SyncProgressIndicator } from '@/components/mail/SyncProgressRing'

export default function MailToolbar({
  onNewMail,
  onRefresh,
  syncing,
  syncProgress,
  lastSyncLabel,
  search,
  onSearchChange,
}: {
  onNewMail: () => void
  onRefresh: () => void
  syncing: boolean
  syncProgress?: MailSyncProgressUI | null
  lastSyncLabel: string
  search: string
  onSearchChange: (v: string) => void
}) {
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
        + Nouveau mail
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
        {syncing ? 'Synchronisation…' : '↻ Synchroniser'}
      </button>
      {syncing && syncProgress ? (
        <SyncProgressIndicator progress={syncProgress} size={34} />
      ) : (
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
      )}
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
    </div>
  )
}
