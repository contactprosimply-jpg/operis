'use client'

import { useState, useEffect, ReactNode } from 'react'
import { TenderStatus, ConsultationStatus } from '@/types/database'

// ── BADGE ────────────────────────────────────────────────────
const badgeMap: Record<string, { bg: string; color: string; border: string; glow: string }> = {
  blue:  { bg: 'rgba(59,126,246,0.15)',  color: '#60a5fa', border: 'rgba(59,126,246,0.35)', glow: '0 0 12px rgba(59,126,246,0.25)' },
  green: { bg: 'rgba(16,185,129,0.15)',   color: '#34d399', border: 'rgba(16,185,129,0.35)', glow: '0 0 12px rgba(16,185,129,0.25)' },
  red:   { bg: 'rgba(239,68,68,0.15)',    color: '#f87171', border: 'rgba(239,68,68,0.35)', glow: '0 0 12px rgba(239,68,68,0.25)' },
  amber: { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24', border: 'rgba(245,158,11,0.35)', glow: '0 0 12px rgba(245,158,11,0.25)' },
  gray:  { bg: 'rgba(148,163,184,0.08)', color: '#94a3b8', border: 'rgba(148,163,184,0.15)', glow: 'none' },
}

export function Badge({ color = 'gray', children, glow }: { color?: string; children: ReactNode; glow?: boolean }) {
  const s = badgeMap[color] ?? badgeMap.gray
  return (
    <span style={{
      fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 600,
      padding: '3px 8px', borderRadius: 6,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      boxShadow: glow ? s.glow : 'none',
    }}>{children}</span>
  )
}

const statusBorderColor: Record<TenderStatus, string> = {
  nouveau: '#3b7ef6', en_cours: '#3b7ef6', urgence: '#f59e0b',
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
    gagne:    { color: 'green', label: 'Gagne' },
    perdu:    { color: 'red',   label: 'Perdu' },
    cloture:  { color: 'gray',  label: 'Cloture' },
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
    envoye:     { color: 'blue',  label: 'Envoye' },
    relance:    { color: 'amber', label: 'Relance' },
    relance_2:  { color: 'amber', label: 'Relance 2' },
    repondu:    { color: 'green', label: 'Repondu' },
    refuse:     { color: 'red',   label: 'Refuse' },
  }
  const { color, label } = m[status] ?? { color: 'gray', label: status }
  return <Badge color={color}>{label}</Badge>
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
        border: `1px solid ${hov ? 'rgba(59,126,246,0.25)' : 'var(--border)'}`,
        borderRadius: 12,
        boxShadow: hov ? 'var(--shadow-hover)' : 'var(--shadow-card)',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'var(--gradient-1)', opacity: hov ? 1 : 0.4,
        transition: 'opacity 0.2s',
      }} />
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
    primary: { background: 'var(--gradient-1)', color: '#fff', border: 'none', boxShadow: '0 4px 14px rgba(59,126,246,0.35)' },
    ghost:   { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-hi)' },
    danger:  { background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.25)' },
    success: { background: 'var(--success-soft)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.25)' },
  }
  return (
    <button
      type={type} onClick={onClick} disabled={loading || disabled} className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 16px', borderRadius: 8,
        fontSize: 12, fontWeight: 600, cursor: (loading || disabled) ? 'not-allowed' : 'pointer',
        transition: 'transform 0.15s ease, opacity 0.15s, box-shadow 0.15s',
        whiteSpace: 'nowrap', opacity: (loading || disabled) ? 0.5 : 1,
        fontFamily: 'DM Sans, system-ui, sans-serif',
        ...variants[variant] ?? variants.ghost,
        ...style,
      }}
      onMouseEnter={e => { if (!loading && !disabled && variant === 'primary') (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
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
      border: '2px solid rgba(59,126,246,0.15)',
      borderTopColor: 'var(--accent)',
      animation: 'spin 0.7s linear infinite',
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
      background: 'rgba(10,15,30,0.75)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="animate-scale" style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
        borderRadius: 16, padding: '24px 28px',
        width: 440, maxWidth: '94vw',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: 'var(--text-primary)' }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

// ── TOAST ────────────────────────────────────────────────────
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="animate-fade" style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 200,
      background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
      borderRadius: 10, padding: '10px 16px',
      fontSize: 12, color: 'var(--text-primary)',
      fontFamily: 'DM Mono, monospace',
      boxShadow: 'var(--shadow-card)',
    }}>
      {message}
    </div>
  )
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const show = (msg: string) => setMessage(msg)
  const ToastComponent = message ? <Toast message={message} onDone={() => setMessage(null)} /> : null
  return { show, ToastComponent }
}

// ── FIELD ────────────────────────────────────────────────────
export function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>
        {label}
      </div>
      <div style={{
        borderRadius: 8, padding: focused ? 1 : 0,
        background: focused ? 'var(--gradient-1)' : 'transparent',
        transition: 'padding 0.15s',
      }}>
        <input
          type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: '100%', background: 'var(--bg-secondary)',
            border: focused ? 'none' : '1px solid var(--border-hi)',
            borderRadius: focused ? 7 : 8,
            padding: '9px 13px', fontSize: 13, color: 'var(--text-primary)',
            fontFamily: 'DM Sans, system-ui, sans-serif', outline: 'none',
            display: 'block',
          }}
        />
      </div>
    </div>
  )
}

// ── KPI CARD ─────────────────────────────────────────────────
const kpiGradients: Record<string, string> = {
  blue: 'linear-gradient(135deg, rgba(59,126,246,0.18) 0%, rgba(99,102,241,0.08) 100%)',
  green: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(59,126,246,0.06) 100%)',
  amber: 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(239,68,68,0.06) 100%)',
  purple: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(59,126,246,0.08) 100%)',
}

export function KpiCard({ label, value, delta, deltaVariant = 'success', icon, color = 'blue', delay = 0 }: {
  label: string; value: string | number; delta?: string;
  deltaVariant?: 'success' | 'warn' | 'danger';
  icon?: ReactNode; color?: string; delay?: number
}) {
  const deltaColor = { success: '#34d399', warn: '#fbbf24', danger: '#f87171' }
  return (
    <div className="animate-fade" style={{
      background: kpiGradients[color] ?? kpiGradients.blue,
      border: '1px solid var(--border)',
      borderRadius: 12, padding: '18px 20px',
      boxShadow: 'var(--shadow-card)',
      animationDelay: `${delay}ms`,
      opacity: 0,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>{label}</div>
        {icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)',
          }}>{icon}</div>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>{value}</div>
      {delta && <div style={{ fontSize: 11, color: deltaColor[deltaVariant], marginTop: 6, fontWeight: 500 }}>{delta}</div>}
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
  const colors: Record<string, string> = { accent: 'var(--accent)', warn: 'var(--warn)', danger: 'var(--danger)', success: 'var(--success)' }
  return (
    <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: colors[variant] ?? colors.accent, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  )
}
