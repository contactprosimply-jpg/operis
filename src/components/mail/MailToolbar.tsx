'use client'

import type { MailSyncUIState } from '@/lib/mail-sync-ui'
import { SyncProgressIndicator } from '@/components/mail/SyncProgressRing'
import type { MailSyncProgressUI } from '@/lib/mail-sync-progress'

function progressFromSyncUI(syncUI: MailSyncUIState): MailSyncProgressUI | null {
  if (syncUI.status === 'syncing') {
    const percent = syncUI.total > 0
      ? Math.min(100, Math.round((syncUI.current / syncUI.total) * 100))
      : null
    return {
      percent,
      current: syncUI.current,
      total: syncUI.total,
      label: syncUI.label ?? `Synchronisation… ${syncUI.current.toLocaleString('fr-FR')} / ${syncUI.total.toLocaleString('fr-FR')}`,
    }
  }
  return null
}

export default function MailToolbar({
  onNewMail,
  onRefresh,
  syncUI,
  onRetrySync,
  search,
  onSearchChange,
  favoritesOnly,
  onFavoritesOnlyChange,
}: {
  onNewMail: () => void
  onRefresh: () => void
  syncUI: MailSyncUIState
  onRetrySync: () => void
  search: string
  onSearchChange: (v: string) => void
  favoritesOnly: boolean
  onFavoritesOnlyChange: (v: boolean) => void
}) {
  const syncing = syncUI.status === 'syncing'
  const syncProgress = progressFromSyncUI(syncUI)

  const lastSyncLabel = syncUI.status === 'idle' && syncUI.lastSyncAt
    ? `Dernière synchro à ${new Date(syncUI.lastSyncAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : syncUI.status === 'done'
      ? `✓ ${syncUI.added} nouveau(x) mail(s)`
      : 'Sync non effectuée'

  return (
    <>
      {syncUI.status === 'syncing' && syncProgress && (
        <div className="sync-banner" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(59,126,246,0.08)',
          flexShrink: 0,
        }}>
          <SyncProgressIndicator progress={syncProgress} size={30} />
          <progress
            value={syncUI.current}
            max={Math.max(syncUI.total, 1)}
            style={{ flex: 1, height: 6, accentColor: '#FFB400' }}
          />
        </div>
      )}
      {syncUI.status === 'done' && (
        <div className="sync-banner sync-success" style={{
          padding: '8px 14px',
          borderBottom: '1px solid rgba(16,185,129,0.25)',
          background: 'rgba(16,185,129,0.1)',
          color: '#10b981',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'DM Sans, system-ui',
        }}>
          ✓ Synchronisation terminée — {syncUI.added} nouveaux mails
        </div>
      )}
      {syncUI.status === 'error' && (
        <div className="sync-banner sync-error" style={{
          padding: '8px 14px',
          borderBottom: '1px solid rgba(239,68,68,0.25)',
          background: 'rgba(239,68,68,0.08)',
          color: '#ef4444',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: 'DM Sans, system-ui',
        }}>
          <span>{syncUI.message}</span>
          <button
            type="button"
            onClick={onRetrySync}
            style={{
              minHeight: 36,
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              background: '#FFB400',
              color: '#021246',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Réessayer
          </button>
        </div>
      )}
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
        {syncUI.status === 'idle' && (
          <span style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'DM Mono, monospace',
            whiteSpace: 'nowrap',
          }}>
            {lastSyncLabel}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 120, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Rechercher nom, prénom, sujet…"
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
          <button
            type="button"
            onClick={() => onFavoritesOnlyChange(!favoritesOnly)}
            title="Afficher uniquement les favoris"
            style={{
              minHeight: 36,
              minWidth: 36,
              borderRadius: 8,
              border: favoritesOnly ? '1px solid #FFB400' : '1px solid var(--border)',
              background: favoritesOnly ? 'rgba(255,180,0,0.15)' : 'transparent',
              color: favoritesOnly ? '#FFB400' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            ★
          </button>
        </div>
      </div>
    </>
  )
}
