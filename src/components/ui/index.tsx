'use client'
// ============================================================
// OPERIS — components/ui/index.tsx
// Composants UI réutilisables
// ============================================================

import { useState, useEffect, ReactNode } from 'react'
import { TenderStatus, ConsultationStatus } from '@/types/database'

// ── BADGE ────────────────────────────────────────────────────
const badgeStyles: Record<string, string> = {
  blue:  'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  green: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  red:   'bg-red-500/15 text-red-400 border border-red-500/25',
  amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  gray:  'bg-white/5 text-slate-400 border border-white/10',
}

export function Badge({ color = 'gray', children }: { color?: string; children: ReactNode }) {
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded inline-block ${badgeStyles[color] ?? badgeStyles.gray}`}>
      {children}
    </span>
  )
}

// Mapper les statuts AO vers des badges
export function TenderStatusBadge({ status }: { status: TenderStatus }) {
  const map: Record<TenderStatus, { color: string; label: string }> = {
    nouveau:  { color: 'blue',  label: 'Nouveau' },
    en_cours: { color: 'blue',  label: 'En cours' },
    urgence:  { color: 'amber', label: 'Urgence' },
    gagne:    { color: 'green', label: 'Gagné' },
    perdu:    { color: 'red',   label: 'Perdu' },
    cloture:  { color: 'gray',  label: 'Clôturé' },
  }
  const { color, label } = map[status] ?? { color: 'gray', label: status }
  return <Badge color={color}>{label}</Badge>
}

export function ConsultationStatusBadge({ status }: { status: ConsultationStatus }) {
  const map: Record<ConsultationStatus, { color: string; label: string }> = {
    en_attente: { color: 'gray',  label: 'En attente' },
    envoye:     { color: 'blue',  label: 'Envoyé' },
    relance:    { color: 'amber', label: 'Relancé' },
    relance_2:  { color: 'amber', label: 'Relance 2' },
    repondu:    { color: 'green', label: 'Répondu' },
    refuse:     { color: 'red',   label: 'Refusé' },
  }
  const { color, label } = map[status] ?? { color: 'gray', label: status }
  return <Badge color={color}>{label}</Badge>
}

// ── BUTTON ───────────────────────────────────────────────────
interface ButtonProps {
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger' | 'success'
  loading?: boolean
  disabled?: boolean
  children: ReactNode
  className?: string
  type?: 'button' | 'submit'
}

const btnStyles = {
  primary: 'bg-blue-500 hover:bg-blue-600 text-white',
  ghost:   'bg-transparent border border-white/15 text-slate-400 hover:bg-white/5 hover:text-white',
  danger:  'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20',
  success: 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20',
}

export function Button({
  onClick, variant = 'ghost', loading, disabled, children, className = '', type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
        transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
        ${btnStyles[variant]} ${className}
      `}
    >
      {loading ? <Spinner size={12} /> : null}
      {children}
    </button>
  )
}

// ── SPINNER ──────────────────────────────────────────────────
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className="animate-spin"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  )
}

// ── MODAL ────────────────────────────────────────────────────
interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#021246]/88"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#0d1f5c] border border-blue-500/35 rounded-xl p-6 w-[440px] max-w-[92vw]">
        <div className="text-sm font-bold mb-5">{title}</div>
        {children}
      </div>
    </div>
  )
}

// ── TOAST ────────────────────────────────────────────────────
interface ToastProps { message: string; onDone: () => void }

export function Toast({ message, onDone }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed bottom-6 right-6 z-[200] bg-[#0a1f6e] border border-blue-500 rounded-lg px-4 py-2.5 text-xs text-blue-300 font-mono animate-in slide-in-from-bottom-2">
      {message}
    </div>
  )
}

// ── Hook useToast ─────────────────────────────────────────────
export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const show = (msg: string) => setMessage(msg)
  const hide = () => setMessage(null)
  const ToastComponent = message ? <Toast message={message} onDone={hide} /> : null
  return { show, ToastComponent }
}

// ── INPUT ────────────────────────────────────────────────────
interface InputProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
}

export function Field({ label, value, onChange, placeholder, type = 'text', required }: InputProps) {
  return (
    <div className="mb-4">
      <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-white/5 border border-blue-500/35 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  )
}

// ── PROGRESS BAR ─────────────────────────────────────────────
export function ProgressBar({ value, max = 100, variant = 'accent' }: {
  value: number; max?: number; variant?: 'accent' | 'warn' | 'danger' | 'success'
}) {
  const pct = Math.round(Math.min(100, (value / max) * 100))
  const colors = {
    accent:  'bg-blue-500',
    warn:    'bg-amber-500',
    danger:  'bg-red-500',
    success: 'bg-emerald-500',
  }
  return (
    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colors[variant]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── KPI CARD ─────────────────────────────────────────────────
export function KpiCard({ label, value, delta, deltaVariant = 'success' }: {
  label: string; value: string | number; delta?: string; deltaVariant?: 'success' | 'warn' | 'danger'
}) {
  const deltaColor = { success: 'text-emerald-400', warn: 'text-amber-400', danger: 'text-red-400' }
  return (
    <div className="bg-white/5 border border-blue-500/15 rounded-lg p-4">
      <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-2">{label}</div>
      <div className="font-mono text-2xl font-medium text-white">{value}</div>
      {delta && <div className={`text-xs mt-1 ${deltaColor[deltaVariant]}`}>{delta}</div>}
    </div>
  )
}
