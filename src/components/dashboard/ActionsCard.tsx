'use client'

import Link from 'next/link'
import { CalendarClock, FileText, Mail, RefreshCw, Truck, type LucideIcon } from 'lucide-react'
import type { ActionIcon, DashboardAction } from '@/lib/dashboard-actions'

const ICONS: Record<ActionIcon, LucideIcon> = {
  relance: RefreshCw,
  truck: Truck,
  document: FileText,
  mail: Mail,
  calendar: CalendarClock,
}

export function ActionsCard({ actions, loading, loadError, busyId, onRelaunch, onRetry }: {
  actions: DashboardAction[]
  loading: boolean
  /** Les relances / devis n'ont pas pu être chargés : la liste serait incomplète. */
  loadError: boolean
  busyId: string | null
  onRelaunch: (action: DashboardAction) => void
  onRetry: () => void
}) {
  return (
    <section className="db-card" aria-labelledby="db-actions-title" data-tour="dashboard-actions">
      <div className="db-card-head">
        <h2 id="db-actions-title" className="db-card-title">À faire aujourd&apos;hui</h2>
        <span className="db-card-hint db-mono">Trié par urgence</span>
      </div>

      {loadError && (
        <p className="db-notice" role="alert">
          <span>Les relances et les devis n&apos;ont pas pu être chargés : cette liste est incomplète.</span>
          <button type="button" onClick={onRetry}>Réessayer</button>
        </p>
      )}

      {loading ? (
        <ul className="db-list" aria-busy="true">
          {[0, 1, 2].map(i => (
            <li key={i} className="db-row">
              <span className="db-ico skeleton" />
              <div className="db-row-main">
                <div className="skeleton" style={{ height: 16, width: '55%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 12, width: '35%' }} />
              </div>
            </li>
          ))}
        </ul>
      ) : actions.length === 0 ? (
        !loadError && (
          <div className="db-empty">
            <h3 className="db-empty-title">Tout est à jour</h3>
            <p className="db-empty-text">
              Aucune relance, aucun devis ni mail en attente. Profitez-en pour préparer vos prochaines consultations.
            </p>
          </div>
        )
      ) : (
        <ul className="db-list">
          {actions.map(a => {
            const Icon = ICONS[a.icon]
            const busy = busyId === a.id
            const label = busy ? 'Envoi…' : a.cta.label
            return (
              <li key={a.id} className="db-row">
                <span className={`db-ico db-tone-${a.tone}`}><Icon size={20} aria-hidden /></span>
                <div className="db-row-main">
                  <p className="db-row-title">{a.title}</p>
                  <p className="db-row-ctx">{a.context}</p>
                </div>
                <div className="db-row-side">
                  <span className={`db-tag db-mono db-tag-${a.tag.tone}`}>{a.tag.label}</span>
                  {a.cta.kind === 'link' ? (
                    <Link href={a.cta.href} className="db-btn-secondary" aria-label={`${a.cta.label} : ${a.title}`}>
                      {a.cta.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="db-btn-secondary"
                      disabled={busyId !== null}
                      aria-label={`${a.cta.label} : ${a.title}`}
                      onClick={() => onRelaunch(a)}
                    >
                      {label}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
