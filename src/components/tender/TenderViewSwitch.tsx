'use client'

import { Columns3, LayoutGrid, List } from 'lucide-react'

export type TenderViewMode = 'liste' | 'cartes' | 'kanban'

const OPTIONS: { value: TenderViewMode; label: string; Icon: typeof List }[] = [
  { value: 'liste', label: 'Liste', Icon: List },
  { value: 'cartes', label: 'Cartes', Icon: LayoutGrid },
  { value: 'kanban', label: 'Kanban', Icon: Columns3 },
]

export function TenderViewSwitch({ value, onChange }: {
  value: TenderViewMode
  onChange: (v: TenderViewMode) => void
}) {
  return (
    <div
      role="group"
      aria-label="Affichage des AO"
      data-tour="tenders-view-switch"
      style={{
        display: 'inline-flex', padding: 3, gap: 2, borderRadius: 10,
        background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)',
      }}
    >
      {OPTIONS.map(({ value: v, label, Icon }) => {
        const active = v === value
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            title={label}
            onClick={() => onChange(v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12,
              fontFamily: 'DM Sans, system-ui', fontWeight: active ? 600 : 500,
              background: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon size={15} aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
