'use client'

import type { MailSyncProgressUI } from '@/lib/mail-sync-progress'
import { syncPercent } from '@/lib/mail-sync-ui'

export function SyncProgressRing({
  percent,
  size = 40,
  strokeWidth = 3,
  showPercent = true,
  done = false,
}: {
  percent: number | null
  size?: number
  strokeWidth?: number
  showPercent?: boolean
  done?: boolean
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2
  const normalized = done ? 100 : (percent != null ? Math.max(0, Math.min(100, percent)) : null)
  const dashOffset = normalized != null
    ? circumference - (normalized / 100) * circumference
    : circumference * 0.72
  const fontSize = size < 32 ? 7 : size < 44 ? 8 : 10
  const checkSize = size < 36 ? 14 : size < 44 ? 18 : 22

  return (
    <div
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      role="progressbar"
      aria-valuenow={normalized ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={done ? 'Synchronisation terminée' : normalized != null ? `Avancement ${normalized} pour cent` : 'Synchronisation en cours'}
    >
      <svg
        width={size}
        height={size}
        style={{
          transform: 'rotate(-90deg)',
          animation: normalized == null && !done ? 'spin 1s linear infinite' : undefined,
        }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--border-hi)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={done ? '#16a34a' : 'var(--accent)'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: normalized != null ? 'stroke-dashoffset 0.35s ease, stroke 0.25s ease' : undefined }}
        />
      </svg>
      {done ? (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#16a34a',
            fontSize: checkSize,
            fontWeight: 700,
            lineHeight: 1,
          }}
          aria-hidden
        >
          ✓
        </span>
      ) : showPercent && normalized != null ? (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize,
            fontWeight: 700,
            fontFamily: 'DM Mono, monospace',
            color: 'var(--accent)',
            lineHeight: 1,
          }}
        >
          {normalized}%
        </span>
      ) : null}
    </div>
  )
}

export function SyncProgressIndicator({
  progress,
  size = 36,
  compact = false,
  done = false,
}: {
  progress: MailSyncProgressUI
  size?: number
  compact?: boolean
  done?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, minWidth: 0 }}>
      <SyncProgressRing percent={progress.percent} size={size} done={done} />
      {!compact && (
        <div style={{ minWidth: 0 }}>
          {done ? (
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#16a34a',
              fontFamily: 'DM Sans, system-ui',
              lineHeight: 1.2,
            }}>
              Terminé
            </div>
          ) : progress.percent != null ? (
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontFamily: 'DM Sans, system-ui',
              lineHeight: 1.2,
            }}>
              {progress.percent}%
            </div>
          ) : null}
          <div style={{
            fontSize: 10,
            color: done ? '#16a34a' : 'var(--text-muted)',
            fontFamily: 'DM Mono, monospace',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {done ? 'Synchronisation terminée' : progress.label}
          </div>
        </div>
      )}
    </div>
  )
}

export function syncProgressFromCounts(current: number, total: number, label?: string): MailSyncProgressUI {
  return {
    current,
    total,
    percent: syncPercent(current, total),
    label: label ?? `Synchronisation… ${current.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}`,
  }
}
