'use client'

import type { MailSyncProgressUI } from '@/lib/mail-sync-progress'

export function SyncProgressRing({
  percent,
  size = 40,
  strokeWidth = 3,
  showPercent = true,
}: {
  percent: number | null
  size?: number
  strokeWidth?: number
  showPercent?: boolean
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2
  const normalized = percent != null ? Math.max(0, Math.min(100, percent)) : null
  const dashOffset = normalized != null
    ? circumference - (normalized / 100) * circumference
    : circumference * 0.72
  const fontSize = size < 32 ? 7 : size < 44 ? 8 : 10

  return (
    <div
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      role="progressbar"
      aria-valuenow={normalized ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={normalized != null ? `Avancement ${normalized} pour cent` : 'Synchronisation en cours'}
    >
      <svg
        width={size}
        height={size}
        style={{
          transform: 'rotate(-90deg)',
          animation: normalized == null ? 'spin 1s linear infinite' : undefined,
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
          stroke="var(--accent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: normalized != null ? 'stroke-dashoffset 0.35s ease' : undefined }}
        />
      </svg>
      {showPercent && normalized != null && (
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
      )}
    </div>
  )
}

export function SyncProgressIndicator({
  progress,
  size = 36,
  compact = false,
}: {
  progress: MailSyncProgressUI
  size?: number
  compact?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, minWidth: 0 }}>
      <SyncProgressRing percent={progress.percent} size={size} />
      {!compact && (
        <div style={{ minWidth: 0 }}>
          {progress.percent != null && (
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontFamily: 'DM Sans, system-ui',
              lineHeight: 1.2,
            }}>
              {progress.percent}%
            </div>
          )}
          <div style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'DM Mono, monospace',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {progress.label}
          </div>
        </div>
      )}
    </div>
  )
}
