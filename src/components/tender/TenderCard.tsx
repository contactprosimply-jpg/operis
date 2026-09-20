'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Calendar, Euro, FolderOpen, Users } from 'lucide-react'
import { format, isValid, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { TenderStats } from '@/types/database'
import { AoStatusBadge } from '@/components/tender/AoStatusBadge'

const GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-orange-400 to-red-500',
  'from-emerald-400 to-teal-600',
  'from-violet-500 to-purple-700',
  'from-amber-400 to-orange-500',
]

// Au-delà, le délai d'entrée s'accumule pour rien sur une longue liste.
const MAX_STAGGER_INDEX = 12

function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null
  const d = parseISO(deadline)
  return isValid(d) ? format(d, 'dd MMM yyyy', { locale: fr }) : null
}

function quotesSummary(t: TenderStats): string {
  if (!t.nb_quotes) return "Aucun devis reçu pour l'instant"
  const n = `${t.nb_quotes} devis reçu${t.nb_quotes > 1 ? 's' : ''}`
  return t.min_quote ? `${n} · dès ${t.min_quote.toLocaleString('fr-FR')} €` : n
}

export function TenderCard({ tender, index }: { tender: TenderStats; index: number }) {
  const total = tender.nb_suppliers ?? 0
  const done = tender.nb_responses ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const delay = Math.min(index, MAX_STAGGER_INDEX) * 0.05
  const deadline = formatDeadline(tender.deadline)

  return (
    <Link href={`/tenders/${tender.tender_id}`} className="group block rounded-2xl no-underline">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(2,18,70,0.15)' }}
        className="cursor-pointer overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card"
      >
        <div className={`relative h-32 overflow-hidden bg-gradient-to-br ${GRADIENTS[index % GRADIENTS.length]}`}>
          <div
            className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(255,255,255,0.3) 0%, transparent 50%)' }}
          />
          <div className="absolute right-4 top-4">
            <AoStatusBadge status={tender.status} />
          </div>
          <div className="absolute bottom-4 left-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <FolderOpen size={20} className="text-white" />
          </div>
        </div>

        <div className="p-5">
          <h3 className="line-clamp-1 text-base font-bold text-slate-900 transition-colors group-hover:text-orange-600">
            {tender.title}
          </h3>
          <p className="mb-4 mt-1 line-clamp-2 text-sm text-slate-500">{quotesSummary(tender)}</p>

          <div className="mb-4 space-y-2 text-xs text-slate-500">
            {tender.client && (
              <div className="flex items-center gap-2">
                <Users size={12} className="shrink-0" />
                <span className="truncate">{tender.client}</span>
              </div>
            )}
            {deadline && (
              <div className="flex items-center gap-2">
                <Calendar size={12} className="shrink-0" />
                <span className="truncate">Échéance {deadline}</span>
              </div>
            )}
            {!!tender.budget_ht && (
              <div className="flex items-center gap-2">
                <Euro size={12} className="shrink-0" />
                <span className="truncate">Budget {tender.budget_ht.toLocaleString('fr-FR')} € HT</span>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-slate-500">Réponses fournisseurs</span>
              <span className="font-bold text-slate-700">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <motion.div
                className="h-full rounded-full bg-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: delay + 0.3 }}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {total > 0 ? `${done}/${total} fournisseur${total > 1 ? 's' : ''}` : 'Aucun fournisseur consulté'}
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  )
}
