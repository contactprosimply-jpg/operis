'use client'

import { useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Email } from '@/types/database'

export type MailVirtualRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'email'; id: string; email: Email }

const HEADER_HEIGHT = 28
const ROW_HEIGHT = 76
const ROW_HEIGHT_MOBILE = 88

export function buildMailVirtualRows(
  grouped: Array<{ label: string; emails: Email[] }>,
): MailVirtualRow[] {
  const rows: MailVirtualRow[] = []
  for (const group of grouped) {
    rows.push({ kind: 'header', id: `header-${group.label}`, label: group.label })
    for (const email of group.emails) {
      rows.push({ kind: 'email', id: email.id, email })
    }
  }
  return rows
}

type MailVirtualListProps = {
  grouped: Array<{ label: string; emails: Email[] }>
  scrollRef: React.RefObject<HTMLDivElement | null>
  isMobile?: boolean
  selectedId?: string | null
  onSelect: (email: Email) => void
  onHover: (emailId: string) => void
  onContextMenu?: (emailId: string) => void
  onNearBottom?: () => void
  renderEmailRow: (email: Email, selected: boolean) => React.ReactNode
}

export default function MailVirtualList({
  grouped,
  scrollRef,
  isMobile = false,
  selectedId,
  onSelect,
  onHover,
  onContextMenu,
  onNearBottom,
  renderEmailRow,
}: MailVirtualListProps) {
  const rows = useMemo(() => buildMailVirtualRows(grouped), [grouped])
  const rowHeight = isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: index => (rows[index]?.kind === 'header' ? HEADER_HEIGHT : rowHeight),
    overscan: 8,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      style={{
        height: virtualizer.getTotalSize(),
        width: '100%',
        position: 'relative',
      }}
      onScrollCapture={() => {
        const el = scrollRef.current
        if (!el || !onNearBottom) return
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
        if (nearBottom) onNearBottom()
      }}
    >
      {virtualItems.map(vRow => {
        const row = rows[vRow.index]
        if (!row) return null
        return (
          <div
            key={row.id}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start}px)`,
            }}
          >
            {row.kind === 'header' ? (
              <div style={{
                padding: '8px 14px 4px', fontSize: 10, fontWeight: 600,
                color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                background: 'var(--bg-secondary)', height: HEADER_HEIGHT,
                boxSizing: 'border-box',
              }}>
                {row.label}
              </div>
            ) : (
              <div
                onClick={() => onSelect(row.email)}
                onMouseEnter={() => onHover(row.email.id)}
                onContextMenu={e => {
                  e.preventDefault()
                  onContextMenu?.(row.email.id)
                }}
              >
                {renderEmailRow(row.email, selectedId === row.email.id)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
