'use client'

import type { MailSyncUIState } from '@/lib/mail-sync-ui'
import { SyncProgressRing } from '@/components/mail/SyncProgressRing'

/** Indicateur passif : affiche l'état uniquement, aucune action au survol ni au clic. */
function PassiveSyncIndicator({
  syncing,
  syncDone,
  syncProgress,
}: {
  syncing: boolean
  syncDone: boolean
  syncProgress: { percent: number | null; label: string }
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={syncProgress.label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 8,
        border: `1px solid ${syncDone ? 'rgba(22,163,74,0.35)' : 'var(--border)'}`,
        background: syncDone ? 'rgba(22,163,74,0.08)' : 'transparent',
        pointerEvents: 'none',
        userSelect: 'none',
        fontFamily: 'DM Sans, system-ui',
      }}
    >
      <SyncProgressRing percent={syncProgress.percent} size={32} done={syncDone} />
      <span style={{
        fontSize: 11,
        color: syncDone ? '#10b981' : 'var(--text-muted)',
        fontFamily: 'DM Mono, monospace',
        whiteSpace: 'nowrap',
      }}>
        {syncing ? 'Synchronisation…' : 'Terminé'}
      </span>
    </div>
  )
}

export default function MailToolbar({
  onNewMail,
  onRefresh,
  syncUI,
  syncInBackground,
  onRetrySync,
  search,
  onSearchChange,
  favoritesOnly,
  onFavoritesOnlyChange,
}: {
  onNewMail: () => void
  onRefresh: () => void
  syncUI: MailSyncUIState
  syncInBackground?: boolean
  onRetrySync: () => void
  search: string
  onSearchChange: (v: string) => void
  favoritesOnly: boolean
  onFavoritesOnlyChange: (v: boolean) => void
}) {
  const syncing = syncUI.status === 'syncing'
  const syncDone = syncUI.status === 'done'
  const syncProgress = syncUI.status === 'syncing'
    ? {
        percent: syncUI.total > 0
          ? Math.min(100, Math.round((syncUI.current / syncUI.total) * 100))
          : null,
        current: syncUI.current,
        total: syncUI.total,
        label: syncUI.label ?? `Synchronisation… ${syncUI.current.toLocaleString('fr-FR')} / ${syncUI.total.toLocaleString('fr-FR')}`,
      }
    : syncUI.status === 'done'
      ? { percent: 100, current: 0, total: 0, label: 'Synchronisation terminée' }
      : null

  const lastSyncLabel = syncUI.status === 'idle' && syncUI.lastSyncAt
    ? `Dernière synchro à ${new Date(syncUI.lastSyncAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : syncUI.status === 'done'
      ? `✓ ${syncUI.added} nouveau(x) mail(s)`
      : 'Sync non effectuée'

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {(syncing || syncDone) && syncProgress ? (
          <PassiveSyncIndicator syncing={syncing} syncDone={syncDone} syncProgress={syncProgress} />
        ) : (
          <button
            type="button"
            onClick={onRefresh}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'DM Sans, system-ui',
            }}
          >
            ↻ Synchroniser
          </button>
        )}
        {syncInBackground && syncing && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'DM Mono, monospace',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'pulse 1.5s ease infinite',
              flexShrink: 0,
            }} />
            Synchro en cours en arrière-plan
          </span>
        )}
        {syncUI.status === 'error' && !syncing && (
          <span style={{ fontSize: 11, color: '#ef4444', fontFamily: 'DM Sans, system-ui', display: 'flex', alignItems: 'center', gap: 6 }}>
            Synchro interrompue
            <button
              type="button"
              onClick={onRetrySync}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: 'none',
                background: '#FFB400',
                color: '#021246',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 10,
              }}
            >
              Réessayer
            </button>
          </span>
        )}
      </div>
      {(syncUI.status === 'idle' || syncUI.status === 'done') && !syncInBackground && (
        <span style={{
          fontSize: 11,
          color: syncUI.status === 'done' ? '#10b981' : 'var(--text-muted)',
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
            padding: '6px 10px',
            borderRadius: 8,
            border: `1px solid ${favoritesOnly ? '#FFB400' : 'var(--border)'}`,
            background: favoritesOnly ? 'rgba(255,180,0,0.12)' : 'transparent',
            color: favoritesOnly ? '#FFB400' : 'var(--text-muted)',
            fontSize: 14,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ★
        </button>
      </div>
    </div>
  )
}
