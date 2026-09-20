import type { TenderStatus } from '@/types/database'
import { cn } from '@/lib/cn'

export const AO_STATUSES: { value: TenderStatus; label: string; badge: string; accent: string }[] = [
  { value: 'nouveau', label: 'Nouveau', badge: 'bg-slate-100 text-slate-600', accent: 'border-t-slate-400' },
  { value: 'en_cours', label: 'En cours', badge: 'bg-green-100 text-green-700', accent: 'border-t-green-500' },
  { value: 'urgence', label: 'Urgence', badge: 'bg-red-100 text-red-700', accent: 'border-t-red-500' },
  { value: 'gagne', label: 'Gagné', badge: 'bg-blue-100 text-blue-700', accent: 'border-t-blue-500' },
  { value: 'perdu', label: 'Perdu', badge: 'bg-yellow-100 text-yellow-700', accent: 'border-t-yellow-500' },
  { value: 'cloture', label: 'Clôturé', badge: 'bg-slate-200 text-slate-600', accent: 'border-t-slate-500' },
]

export function AoStatusBadge({ status }: { status: TenderStatus }) {
  const s = AO_STATUSES.find(o => o.value === status) ?? AO_STATUSES[AO_STATUSES.length - 1]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', s.badge)}>
      {s.label}
    </span>
  )
}
