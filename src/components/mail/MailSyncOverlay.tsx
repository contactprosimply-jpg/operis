'use client'

import type { MailSyncUIState } from '@/lib/mail-sync-ui'
import { SyncProgressRing } from '@/components/mail/SyncProgressRing'

export default function MailSyncOverlay({
  mode,
  syncUI,
  errorMessage,
  onRetry,
}: {
  mode: 'progress' | 'success' | 'error'
  syncUI: MailSyncUIState
  errorMessage?: string
  onRetry?: () => void
}) {
  const syncing = syncUI.status === 'syncing'
  const percent = syncing && syncUI.total > 0
    ? Math.min(100, Math.round((syncUI.current / syncUI.total) * 100))
    : syncing ? null : mode === 'success' ? 100 : null

  const progressLabel = syncing
    ? (syncUI.label ?? `${syncUI.current.toLocaleString('fr-FR')} / ${syncUI.total.toLocaleString('fr-FR')}`)
    : mode === 'success'
      ? 'Synchronisation terminée'
      : errorMessage ?? 'Synchro interrompue — Réessayer'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-busy={mode === 'progress'}
      aria-label={mode === 'success' ? 'Synchronisation terminée' : 'Synchronisation de la boîte mail'}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(8, 13, 24, 0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(100%, 360px)',
          padding: '28px 24px',
          borderRadius: 16,
          background: 'var(--bg-card)',
          border: `1px solid ${mode === 'success' ? 'rgba(22,163,74,0.35)' : mode === 'error' ? 'rgba(239,68,68,0.35)' : 'var(--border-hi)'}`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 16,
        }}
      >
        <SyncProgressRing
          percent={percent}
          size={72}
          strokeWidth={4}
          showPercent={mode === 'progress'}
          done={mode === 'success'}
        />

        <div style={{ minWidth: 0, width: '100%' }}>
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: mode === 'success' ? '#16a34a' : mode === 'error' ? '#ef4444' : 'var(--text-primary)',
            fontFamily: 'DM Sans, system-ui',
            lineHeight: 1.35,
            marginBottom: 6,
          }}>
            {mode === 'success'
              ? '✓ Synchronisation terminée'
              : mode === 'error'
                ? 'Synchro interrompue'
                : 'Synchronisation de votre boîte mail…'}
          </div>

          {mode === 'progress' && syncing && (
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              fontFamily: 'DM Mono, monospace',
              lineHeight: 1.4,
            }}>
              {progressLabel}
            </div>
          )}

          {mode === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <p style={{
                margin: 0,
                fontSize: 12,
                color: 'var(--text-muted)',
                fontFamily: 'DM Sans, system-ui',
                lineHeight: 1.45,
              }}>
                {progressLabel}
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#FFB400',
                    color: '#021246',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'DM Sans, system-ui',
                  }}
                >
                  Réessayer
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
