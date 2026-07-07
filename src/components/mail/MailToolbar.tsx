'use client'

import { useEffect, useRef, useState } from 'react'
import type { MailSyncUIState } from '@/lib/mail-sync-ui'
import { SyncProgressRing } from '@/components/mail/SyncProgressRing'

type MailLayoutValue = 'vertical' | 'horizontal'
type MailDensityValue = 'compact' | 'cozy' | 'comfortable'

/** Menu d'affichage façon Thunderbird : disposition + densité des lignes, regroupées
 *  dans un seul menu déclenché par une icône, plutôt que des boutons séparés. */
function DisplayOptionsMenu({
  layout,
  onLayoutChange,
  density,
  onDensityChange,
}: {
  layout: MailLayoutValue
  onLayoutChange: (v: MailLayoutValue) => void
  density: MailDensityValue
  onDensityChange: (v: MailDensityValue) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const layoutOptions: { value: MailLayoutValue; label: string }[] = [
    { value: 'vertical', label: 'Vue verticale (liste | aperçu)' },
    { value: 'horizontal', label: 'Vue horizontale (liste au-dessus)' },
  ]
  const densityOptions: { value: MailDensityValue; label: string }[] = [
    { value: 'compact', label: 'Compacte' },
    { value: 'cozy', label: 'Cosy' },
    { value: 'comfortable', label: 'Spacieuse' },
  ]

  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '7px 12px', borderRadius: 6, border: 'none', textAlign: 'left',
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
    fontFamily: 'DM Sans, system-ui',
  })

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Options d'affichage"
        style={{
          minHeight: 36, minWidth: 36, padding: '6px 10px', borderRadius: 8,
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          background: open ? 'var(--accent-soft)' : 'transparent',
          color: open ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <line x1="3" y1="6" x2="17" y2="6" />
          <circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none" />
          <line x1="3" y1="10" x2="17" y2="10" />
          <circle cx="7" cy="10" r="1.6" fill="currentColor" stroke="none" />
          <line x1="3" y1="14" x2="17" y2="14" />
          <circle cx="14" cy="14" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 50,
          minWidth: 220, padding: 6, borderRadius: 10,
          background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
          boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ padding: '4px 10px', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Disposition
          </div>
          {layoutOptions.map(opt => (
            <button key={opt.value} type="button" style={itemStyle(layout === opt.value)}
              onClick={() => { onLayoutChange(opt.value); setOpen(false) }}>
              {layout === opt.value ? '●' : '○'} {opt.label}
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
          <div style={{ padding: '4px 10px', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Densité des lignes
          </div>
          {densityOptions.map(opt => (
            <button key={opt.value} type="button" style={itemStyle(density === opt.value)}
              onClick={() => { onDensityChange(opt.value); setOpen(false) }}>
              {density === opt.value ? '●' : '○'} {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
  layout,
  onLayoutChange,
  density,
  onDensityChange,
  folderSidebarCollapsed,
  onToggleFolderSidebar,
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
  layout: MailLayoutValue
  onLayoutChange: (v: MailLayoutValue) => void
  density: MailDensityValue
  onDensityChange: (v: MailDensityValue) => void
  folderSidebarCollapsed: boolean
  onToggleFolderSidebar: () => void
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
        onClick={onToggleFolderSidebar}
        title={folderSidebarCollapsed ? 'Afficher le panneau comptes/dossiers' : 'Masquer le panneau comptes/dossiers'}
        style={{
          minHeight: 36, minWidth: 36, padding: '6px 10px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', flexShrink: 0,
        }}
      >
        {folderSidebarCollapsed ? '▶│' : '│◀'}
      </button>
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
        <DisplayOptionsMenu
          layout={layout}
          onLayoutChange={onLayoutChange}
          density={density}
          onDensityChange={onDensityChange}
        />
      </div>
    </div>
  )
}
