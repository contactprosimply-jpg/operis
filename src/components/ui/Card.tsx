import { cn } from '@/lib/cn'
import type { HTMLAttributes, ReactNode } from 'react'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  padding?: CardPadding
}

export function Card({
  children,
  hover = false,
  padding = 'md',
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)]',
        'border border-[var(--border)]',
        'bg-[var(--surface-raised)]',
        'shadow-[var(--shadow-card)]',
        hover && 'transition-all duration-200 ease-out hover:border-[var(--border-hi)] hover:shadow-[var(--shadow-md)] hover:-translate-y-px',
        paddingClasses[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
