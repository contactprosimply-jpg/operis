'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, Users } from 'lucide-react'
import type { TenderStats, TenderStatus } from '@/types/database'
import { AO_STATUSES } from '@/components/tender/AoStatusBadge'
import { cn } from '@/lib/cn'

function deadlineLabel(days: number | null): { text: string; className: string } | null {
  if (days === null) return null
  if (days < 0) return { text: 'Échéance dépassée', className: 'text-red-600 font-semibold' }
  const className = days <= 3 ? 'text-red-600 font-semibold' : days <= 7 ? 'text-amber-600' : 'text-slate-500'
  return { text: days === 0 ? 'Échéance aujourd’hui' : `Échéance dans ${days} j`, className }
}

export function TenderKanban({ tenders, onStatusChange }: {
  tenders: TenderStats[]
  onStatusChange: (tenderId: string, status: TenderStatus) => void
}) {
  const router = useRouter()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStatus, setOverStatus] = useState<TenderStatus | null>(null)

  const drop = (status: TenderStatus, e: React.DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragId
    setDragId(null)
    setOverStatus(null)
    const tender = tenders.find(t => t.tender_id === id)
    if (tender && tender.status !== status) onStatusChange(tender.tender_id, status)
  }

  return (
    <div className="flex items-start gap-4 overflow-x-auto rounded-2xl bg-slate-50 p-4">
      {AO_STATUSES.map(col => {
        const items = tenders.filter(t => t.status === col.value)
        const isOver = overStatus === col.value && dragId !== null
        return (
          <section
            key={col.value}
            aria-label={`${col.label} (${items.length})`}
            onDragOver={e => { e.preventDefault(); if (overStatus !== col.value) setOverStatus(col.value) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverStatus(null) }}
            onDrop={e => drop(col.value, e)}
            className={cn(
              'w-[280px] shrink-0 rounded-xl border border-t-4 border-slate-200 bg-slate-100/70 p-3 transition-colors',
              col.accent,
              isOver && 'bg-blue-50 ring-2 ring-blue-300',
            )}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-sm font-bold text-slate-700">{col.label}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{items.length}</span>
            </div>

            <div className="space-y-3">
              {items.map(t => {
                const total = t.nb_suppliers ?? 0
                const done = t.nb_responses ?? 0
                const pct = total > 0 ? Math.round((done / total) * 100) : 0
                const deadline = deadlineLabel(t.days_remaining)
                return (
                  <article
                    key={t.tender_id}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', t.tender_id); e.dataTransfer.effectAllowed = 'move'; setDragId(t.tender_id) }}
                    onDragEnd={() => { setDragId(null); setOverStatus(null) }}
                    onClick={() => router.push(`/tenders/${t.tender_id}`)}
                    className={cn(
                      'cursor-grab rounded-xl border border-slate-100 bg-white p-3.5 shadow-card transition hover:shadow-md active:cursor-grabbing',
                      dragId === t.tender_id && 'opacity-40',
                    )}
                  >
                    <Link
                      href={`/tenders/${t.tender_id}`}
                      onClick={e => e.stopPropagation()}
                      draggable={false}
                      className="line-clamp-2 text-sm font-bold text-slate-900 no-underline hover:text-orange-600"
                    >
                      {t.title}
                    </Link>

                    <div className="mt-2 space-y-1.5 text-xs text-slate-500">
                      {t.client && (
                        <div className="flex items-center gap-2">
                          <Users size={12} className="shrink-0" />
                          <span className="truncate">{t.client}</span>
                        </div>
                      )}
                      {deadline && (
                        <div className={cn('flex items-center gap-2', deadline.className)}>
                          <Calendar size={12} className="shrink-0" />
                          <span className="truncate">{deadline.text}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">
                          {total > 0 ? `${done}/${total} réponse${done > 1 ? 's' : ''}` : 'Aucun fournisseur'}
                        </span>
                        <span className="font-bold text-slate-700">{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <select
                      aria-label={`Statut de ${t.title}`}
                      value={t.status}
                      onClick={e => e.stopPropagation()}
                      onChange={e => onStatusChange(t.tender_id, e.target.value as TenderStatus)}
                      className="mt-3 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 [color-scheme:light]"
                    >
                      {AO_STATUSES.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </article>
                )
              })}
              {items.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                  Aucun AO
                </p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
