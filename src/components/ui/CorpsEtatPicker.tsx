'use client'

import { CorpsEtat } from '@/types/database'

export function CorpsEtatPicker({ options, value, onChange, label }: {
  options: CorpsEtat[]
  value: string[]
  onChange: (next: string[]) => void
  label?: string
}) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <div style={{
          fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
          textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'DM Mono, monospace',
        }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(opt => {
          const active = value.includes(opt.id)
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              style={{
                fontFamily: 'DM Sans, system-ui', fontSize: 11.5, fontWeight: 500,
                padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border-hi)'}`,
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          )
        })}
        {options.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Liste indisponible</span>
        )}
      </div>
    </div>
  )
}
