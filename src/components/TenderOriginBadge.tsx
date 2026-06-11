'use client'

type BadgeType = 'creator' | 'assigned'

const STYLES: Record<BadgeType, { bg: string; color: string; border: string }> = {
  creator: {
    bg: 'rgba(59,126,246,0.12)',
    color: '#60a5fa',
    border: 'rgba(59,126,246,0.28)',
  },
  assigned: {
    bg: 'rgba(129,140,248,0.12)',
    color: '#a5b4fc',
    border: 'rgba(129,140,248,0.28)',
  },
}

export default function TenderOriginBadge({
  label,
  type = 'creator',
}: {
  label: string
  type?: BadgeType
}) {
  const s = STYLES[type]
  const text = type === 'assigned' ? `Assigné à ${label}` : `AO · ${label}`

  return (
    <span
      style={{
        fontSize: 9,
        fontFamily: 'DM Mono, monospace',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 4,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}
