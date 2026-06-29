'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'text-white border-0',
    'bg-[var(--accent-gradient)]',
    'shadow-[var(--glow)]',
    'hover:brightness-110 hover:shadow-[var(--glow-strong)]',
    'active:brightness-95',
  ].join(' '),
  secondary: [
    'bg-transparent text-[var(--text-primary)]',
    'border border-[var(--border-hi)]',
    'hover:bg-[var(--surface-hover)] hover:border-[var(--color-accent-cyan)]/40',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--text-secondary)] border border-transparent',
    'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
  ].join(' '),
  danger: [
    'bg-[var(--danger-soft)] text-[var(--danger)]',
    'border border-[rgba(239,68,68,0.28)]',
    'hover:brightness-110',
  ].join(' '),
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-10 px-4 text-sm gap-2 rounded-[var(--radius-md)]',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-[var(--radius-lg)]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function DesignButton(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold',
        'font-[family-name:var(--font-sans)]',
        'transition-all duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-cyan)]',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  )
})
