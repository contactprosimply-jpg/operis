import { cn } from '@/lib/cn'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const paddingClass: Record<CardPadding, string> = {
  none: '',
  sm: 'ds-card--pad-sm',
  md: 'ds-card--pad-md',
  lg: 'ds-card--pad-lg',
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
  style,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'ds-card',
        hover && 'ds-card--interactive',
        paddingClass[padding],
        className,
      )}
      style={style}
      {...props}
    >
      {children}
    </div>
  )
}
