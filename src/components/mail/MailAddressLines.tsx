'use client'

import { useState } from 'react'

/** Découpe une liste d'adresses en respectant les virgules dans les noms. */
export function splitAddressList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  const parts: string[] = []
  let current = ''
  let inAngle = false
  for (const ch of raw) {
    if (ch === '<') inAngle = true
    if (ch === '>') inAngle = false
    if (ch === ',' && !inAngle) {
      if (current.trim()) parts.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

export default function MailAddressLines({
  label,
  value,
  collapsedLimit = 4,
}: {
  label: string
  value: string | null | undefined
  collapsedLimit?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const addresses = splitAddressList(value)
  if (!addresses.length) return null

  const needsCollapse = addresses.length > collapsedLimit
  const visible = expanded || !needsCollapse ? addresses : addresses.slice(0, collapsedLimit)
  const hiddenCount = addresses.length - visible.length

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      fontSize: 13,
      lineHeight: 1.55,
      marginBottom: 4,
      alignItems: 'flex-start',
    }}>
      <span style={{
        color: 'var(--text-muted)',
        fontWeight: 600,
        flexShrink: 0,
        minWidth: 32,
        fontFamily: 'DM Sans, system-ui',
      }}>
        {label}
      </span>
      <div style={{ color: 'var(--text-secondary)', minWidth: 0, flex: 1 }}>
        <span>{visible.join(', ')}</span>
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              marginLeft: 6,
              padding: '2px 8px',
              borderRadius: 6,
              border: '1px solid var(--border-hi)',
              background: 'var(--bg-hover)',
              color: 'var(--accent)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'DM Sans, system-ui',
            }}
          >
            +{hiddenCount} plus
          </button>
        )}
        {expanded && needsCollapse && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{
              marginLeft: 6,
              padding: '2px 8px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'DM Sans, system-ui',
            }}
          >
            afficher moins
          </button>
        )}
      </div>
    </div>
  )
}
