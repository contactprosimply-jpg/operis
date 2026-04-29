'use client'

import { useState, useEffect, ReactNode } from 'react'
import { TenderStatus, ConsultationStatus } from '@/types/database'

// ── BADGE ────────────────────────────────────────────────────
const badgeMap: Record<string, { bg: string; color: string; border: string }> = {
  blue:  { bg: 'rgba(59,126,246,0.1)',  color: '#60a5fa', border: 'rgba(59,126,246,0.2)' },
  green: { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80', border: 'rgba(34,197,94,0.2)' },
  red:   { bg: 'rgba(239,68,68,0.1)',   color: '#f87171', border: 'rgba(239,68,68,0.2)' },
  amber: { bg: 'rgba(245,158,11,0.1)',  color: '#fbbf24', border: 'rgba(245,158,11,0.2)' },
  gray:  { bg: 'rgba(255,255,255,0.05)', color: '#8b92a5', border: 'rgba(255,255,255,0.08)' },
}

export function Badge({ color = 'gray', children }: { color?: string; children: ReactNode }) {
  const s = badgeMap[color] ?? badgeMap.gray
  return (
    <span style={{
      fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 500,
      padding: '2px 7px', borderRadius: 5,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

export function TenderStatusBadge({ status }: { status: TenderStatus }) {
  const m: Record<TenderStatus, { color: string; label: string }> = {
    nouveau:  { color: 'blue',  label: 'Nouveau' },
    en_cours: { color: 'blue',  label: 'En cours' },
    urgence:  { color: 'amber', label: 'Urgent' },
    gagne:    { color: 'green', label: 'Gagne' },
    perdu:    { color: 'red',   label: 'Perdu' },
    cloture:  { color: 'gray',  label: 'Cloture' },
  }
  const { color, label } = m[status] ?? { color: 'gray', label: status }
  return <Badge color={color}>{label}</Badge>
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

// ── BUTTON ───────────────────────────────────────────────────
const btnStyles: Record<string, React.CSSProperties> = {
  primary: { background: 'var(--accent)', color: '#fff', border: 'none' },
  ghost:   { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-hi)' },
  danger:  { background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' },
  success: { background: 'var(--success-soft)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' },
}

export function Button({
  onClick, variant = 'ghost', loading, disabled, children, className = '', type = 'button', style = {}
}: {
  onClick?: () => void; variant?: string; loading?: boolean; disabled?: boolean;
  children: ReactNode; className?: string; type?: 'button' | 'submit'; style?: React.CSSProperties
}) {
  return (
    <button
      type={type} onClick={onClick} disabled={loading || disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 14px', borderRadius: 7,
        fontSize: 12, fontWeight: 500, cursor: 'pointer',
        transition: 'all 0.12s', whiteSpace: 'nowrap',
        opacity: (loading || disabled) ? 0.5 : 1,
        fontFamily: 'DM Sans, system-ui, sans-serif',
        ...btnStyles[variant] ?? btnStyles.ghost,
        ...style,
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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
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
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
        borderRadius: 14, padding: '24px 28px',
        width: 440, maxWidth: '94vw',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, color: 'var(--text-primary)' }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

// ── TOAST ────────────────────────────────────────────────────
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 200,
      background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
      borderRadius: 10, padding: '10px 16px',
      fontSize: 12, color: 'var(--text-primary)',
      fontFamily: 'DM Mono, monospace',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      animation: 'slideUp 0.2s ease',
    }}>
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
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
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>
        {label}
      </div>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: '100%', background: 'var(--bg-secondary)',
          border: '1px solid var(--border-hi)', borderRadius: 8,
          padding: '9px 13px', fontSize: 13, color: 'var(--text-primary)',
          fontFamily: 'DM Sans, system-ui, sans-serif', outline: 'none',
          transition: 'border-color 0.12s',
        }}
        onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
        onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border-hi)'}
      />
    </div>
  )
}

// ── KPI CARD ─────────────────────────────────────────────────
export function KpiCard({ label, value, delta, deltaVariant = 'success' }: {
  label: string; value: string | number; delta?: string; deltaVariant?: 'success' | 'warn' | 'danger'
}) {
  const deltaColor = { success: '#4ade80', warn: '#fbbf24', danger: '#f87171' }
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 18px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>{value}</div>
      {delta && <div style={{ fontSize: 11, color: deltaColor[deltaVariant], marginTop: 5 }}>{delta}</div>}
    </div>
  )
}

// ── PROGRESS BAR ─────────────────────────────────────────────
export function ProgressBar({ value, variant = 'accent' }: { value: number; variant?: string }) {
  const colors: Record<string, string> = { accent: 'var(--accent)', warn: 'var(--warn)', danger: 'var(--danger)', success: 'var(--success)' }
  return (
    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: colors[variant] ?? colors.accent, borderRadius: 2, transition: 'width 0.4s' }} />
    </div>
  )
}
