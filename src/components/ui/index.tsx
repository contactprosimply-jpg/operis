'use client'

import { useState, useEffect, useCallback, ReactNode } from 'react'
import { TenderStatus, ConsultationStatus } from '@/types/database'

// ── BADGE ────────────────────────────────────────────────────
const badgeMap: Record<string, { bg: string; color: string; border: string; glow: string }> = {
  blue:  { bg: 'rgba(79,142,247,0.12)',  color: '#6ba3f9', border: 'rgba(79,142,247,0.3)', glow: '0 0 14px rgba(79,142,247,0.2)' },
  green: { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', border: 'rgba(16,185,129,0.3)', glow: '0 0 14px rgba(16,185,129,0.2)' },
  red:   { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', border: 'rgba(239,68,68,0.3)', glow: '0 0 14px rgba(239,68,68,0.2)' },
  amber: { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', border: 'rgba(245,158,11,0.3)', glow: '0 0 14px rgba(245,158,11,0.2)' },
  gray:  { bg: 'rgba(148,163,184,0.08)', color: '#94a3b8', border: 'rgba(148,163,184,0.15)', glow: 'none' },
}

export function Badge({ color = 'gray', children, glow }: { color?: string; children: ReactNode; glow?: boolean }) {
  const s = badgeMap[color] ?? badgeMap.gray
  return (
    <span style={{
      fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 600,
      letterSpacing: '0.04em',
      padding: '4px 10px', borderRadius: 20,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      boxShadow: glow ? s.glow : 'none',
    }}>{children}</span>
  )
}

const statusBorderColor: Record<TenderStatus, string> = {
  nouveau: '#4f8ef7', en_cours: '#4f8ef7', urgence: '#f59e0b',
  gagne: '#10b981', perdu: '#ef4444', cloture: '#475569',
}

export function getStatusBorderColor(status: TenderStatus) {
  return statusBorderColor[status] ?? '#475569'
}

export function TenderStatusBadge({ status, pulse }: { status: TenderStatus; pulse?: boolean }) {
  const m: Record<TenderStatus, { color: string; label: string }> = {
    nouveau:  { color: 'blue',  label: 'Nouveau' },
    en_cours: { color: 'blue',  label: 'En cours' },
    urgence:  { color: 'amber', label: 'Urgent' },
    gagne:    { color: 'green', label: 'Gagné' },
    perdu:    { color: 'red',   label: 'Perdu' },
    cloture:  { color: 'gray',  label: 'Clôturé' },
  }
  const { color, label } = m[status] ?? { color: 'gray', label: status }
  const showPulse = pulse ?? status === 'urgence'
  return (
    <Badge color={color} glow={status === 'urgence'}>
      {showPulse && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: 'currentColor',
          animation: 'pulse 1.5s ease infinite', flexShrink: 0,
        }} />
      )}
      {label}
    </Badge>
  )
}

export function ConsultationStatusBadge({ status }: { status: ConsultationStatus }) {
  const m: Record<ConsultationStatus, { color: string; label: string }> = {
    en_attente: { color: 'gray',  label: 'En attente' },
    envoye:     { color: 'blue',  label: 'Envoyé' },
    relance:    { color: 'amber', label: 'Relance' },
    relance_2:  { color: 'amber', label: 'Relance 2' },
    repondu:    { color: 'green', label: 'Répondu' },
    refuse:     { color: 'red',   label: 'Refusé' },
  }
  const { color, label } = m[status] ?? { color: 'gray', label: status }
  return <Badge color={color}>{label}</Badge>
}

// ── SKELETON ─────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 14, style = {} }: { width?: string | number; height?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width, height, ...style }} />
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginBottom: 12 }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height={12} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── CARD ─────────────────────────────────────────────────────
export function Card({ children, style = {}, hover = true }: { children: ReactNode; style?: React.CSSProperties; hover?: boolean }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => hover && setHov(true)}
      onMouseLeave={() => hover && setHov(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hov ? 'var(--border-hi)' : 'var(--border)'}`,
        borderRadius: 14,
        boxShadow: hov ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'all 0.22s ease',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── BUTTON ───────────────────────────────────────────────────
export function Button({
  onClick, variant = 'ghost', loading, disabled, children, className = '', type = 'button', style = {}
}: {
  onClick?: () => void; variant?: string; loading?: boolean; disabled?: boolean;
  children: ReactNode; className?: string; type?: 'button' | 'submit'; style?: React.CSSProperties
}) {
  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--gradient-primary)', color: '#fff', border: 'none',
      boxShadow: 'var(--shadow-glow)',
    },
    ghost: {
      background: 'transparent', color: 'var(--text-secondary)',
      border: '1px solid var(--border-hi)',
    },
    danger: {
      background: 'var(--danger-soft)', color: 'var(--danger)',
      border: '1px solid rgba(239,68,68,0.25)',
    },
    success: {
      background: 'var(--success-soft)', color: 'var(--success)',
      border: '1px solid rgba(16,185,129,0.25)',
    },
  }
  return (
    <button
      type={type} onClick={onClick} disabled={loading || disabled} className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 9,
        fontSize: 12, fontWeight: 600, cursor: (loading || disabled) ? 'not-allowed' : 'pointer',
        transition: 'filter 0.15s ease, transform 0.15s ease, opacity 0.15s',
        whiteSpace: 'nowrap', opacity: (loading || disabled) ? 0.55 : 1,
        fontFamily: 'DM Sans, system-ui, sans-serif',
        ...variants[variant] ?? variants.ghost,
        ...style,
      }}
      onMouseEnter={e => {
        if (!loading && !disabled) {
          if (variant === 'primary') (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'
          else (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.filter = ''
        if (variant !== 'primary' && variant !== 'danger' && variant !== 'success') {
          el.style.background = 'transparent'
        }
      }}
    >
      {loading && <Spinner size={11} />}
      {children}
    </button>
  )
}

// ── SPINNER ──────────────────────────────────────────────────
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'conic-gradient(from 0deg, var(--accent), var(--accent-2), transparent)',
      WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
      mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
      animation: 'spin 0.75s linear infinite',
    }} />
  )
}

// ── MODAL ────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="animate-scale" style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
        borderRadius: 16, width: 460, maxWidth: '100%',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          <button type="button" onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-hi)',
            background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ padding: '20px 24px 24px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}

// ── TOAST ────────────────────────────────────────────────────
export function Toast({ message, type = 'success', onDone }: { message: string; type?: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t) }, [onDone])
  const isError = type === 'error'
  return (
    <div className="animate-slide-up" style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 200,
      background: 'var(--bg-card)', border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : 'var(--border-hi)'}`,
      borderRadius: 12, padding: '12px 16px',
      fontSize: 12, color: 'var(--text-primary)',
      fontFamily: 'DM Sans, system-ui',
      boxShadow: 'var(--shadow-md)',
      display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
    }}>
      <span style={{ fontSize: 16 }}>{isError ? '✕' : '✓'}</span>
      <span style={{ color: isError ? '#f87171' : 'var(--text-primary)' }}>{message}</span>
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const show = useCallback((msg: string, type?: 'success' | 'error') => {
    const t = type ?? (msg.toLowerCase().startsWith('erreur') ? 'error' : 'success')
    setToast({ msg, type: t })
  }, [])
  const ToastComponent = toast ? (
    <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />
  ) : null
  return { show, ToastComponent }
}

// ── FIELD ────────────────────────────────────────────────────
export function Field({
  label, value, onChange, placeholder, type = 'text',
  autoComplete, name, inputId, preventAutofill,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoComplete?: string
  name?: string
  inputId?: string
  /** Bloque l'autofill navigateur (Google, etc.) jusqu'au premier focus */
  preventAutofill?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [autofillUnlocked, setAutofillUnlocked] = useState(!preventAutofill)
  const readOnly = preventAutofill && !autofillUnlocked

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
        textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'DM Mono, monospace',
      }}>
        {label}
      </div>
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete ?? (preventAutofill ? 'off' : undefined)}
        readOnly={readOnly}
        data-1p-ignore={preventAutofill ? true : undefined}
        data-lpignore={preventAutofill ? 'true' : undefined}
        data-form-type={preventAutofill ? 'other' : undefined}
        onFocus={() => {
          setFocused(true)
          if (preventAutofill && !autofillUnlocked) setAutofillUnlocked(true)
        }}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', background: 'var(--bg-secondary)',
          border: `1px solid ${focused ? 'var(--accent)' : 'var(--border-hi)'}`,
          borderRadius: 9,
          padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)',
          fontFamily: 'DM Sans, system-ui, sans-serif', outline: 'none',
          display: 'block', transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: focused ? '0 0 0 3px var(--accent-soft), var(--shadow-glow)' : 'none',
        }}
      />
    </div>
  )
}

// ── KPI CARD ─────────────────────────────────────────────────
const kpiAccent: Record<string, string> = {
  blue: '#4f8ef7', green: '#10b981', amber: '#f59e0b', purple: '#818cf8',
}

export function KpiCard({ label, value, delta, deltaVariant = 'success', icon, color = 'blue', delay = 0, progress }: {
  label: string; value: string | number; delta?: string;
  deltaVariant?: 'success' | 'warn' | 'danger';
  icon?: ReactNode; color?: string; delay?: number; progress?: number
}) {
  const [hov, setHov] = useState(false)
  const accent = kpiAccent[color] ?? kpiAccent.blue
  const deltaColor = { success: '#34d399', warn: '#fbbf24', danger: '#f87171' }
  return (
    <div
      className="animate-fade"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hov ? accent + '40' : 'var(--border)'}`,
        borderRadius: 14, padding: '18px 20px 14px',
        boxShadow: hov ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
        animationDelay: `${delay}ms`, opacity: 0,
        position: 'relative', overflow: 'hidden', transition: 'all 0.22s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        {icon && (
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: `${accent}18`, border: `1px solid ${accent}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: accent,
          }}>{icon}</div>
        )}
        <div style={{
          fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.07em', fontFamily: 'DM Mono, monospace', fontWeight: 600,
          marginLeft: icon ? 0 : 'auto', textAlign: icon ? 'right' : 'left', flex: icon ? 1 : undefined,
        }}>{label}</div>
      </div>
      <div style={{
        fontSize: 30, fontWeight: 700, color: 'var(--text-primary)',
        fontFamily: 'DM Mono, monospace', letterSpacing: '-0.03em', lineHeight: 1,
      }}>{value}</div>
      {delta && (
        <div style={{ fontSize: 11, color: deltaColor[deltaVariant], marginTop: 8, fontWeight: 500 }}>{delta}</div>
      )}
      <div style={{ marginTop: 14 }}>
        <ProgressBar value={progress ?? (typeof value === 'number' ? Math.min(value, 100) : 50)} variant={color === 'green' ? 'success' : color === 'amber' ? 'warn' : 'accent'} />
      </div>
    </div>
  )
}

// ── TABLE ROW HOVER ──────────────────────────────────────────
export function tableRowHover(status?: TenderStatus): React.CSSProperties {
  return { transition: 'background 0.15s, border-left 0.15s', borderLeft: '3px solid transparent' }
}

export function tableRowHoverHandlers(status?: TenderStatus) {
  const border = status ? getStatusBorderColor(status) : 'var(--accent)'
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLTableRowElement>) => {
      e.currentTarget.style.background = 'var(--bg-hover)'
      e.currentTarget.style.borderLeftColor = border
    },
    onMouseLeave: (e: React.MouseEvent<HTMLTableRowElement>) => {
      e.currentTarget.style.background = 'transparent'
      e.currentTarget.style.borderLeftColor = 'transparent'
    },
  }
}

// ── PROGRESS BAR ─────────────────────────────────────────────
export function ProgressBar({ value, variant = 'accent' }: { value: number; variant?: string }) {
  const colors: Record<string, string> = {
    accent: 'var(--gradient-primary)', warn: 'var(--warn)', danger: 'var(--danger)', success: 'var(--success)',
  }
  const bg = colors[variant] ?? colors.accent
  const isGrad = variant === 'accent'
  return (
    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${Math.min(100, Math.max(0, value))}%`,
        background: bg, borderRadius: 2, transition: 'width 0.5s ease',
        ...(isGrad ? { background: 'var(--gradient-primary)' } : {}),
      }} />
    </div>
  )
}
