import Link from 'next/link'
import {
  formatDeadline,
  pendingRelaunchLabel,
  responseSummary,
  type DashboardTender,
} from '@/lib/dashboard-actions'

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  nouveau: { label: 'Nouveau', className: 'db-tag-neutral' },
  en_cours: { label: 'En cours', className: 'db-tone-accent' },
  urgence: { label: 'Urgence', className: 'db-tag-red' },
}

/** Les AO actifs les plus urgents (déjà triés et limités à 4 par l'appelant). */
export function ActiveTendersCard({ tenders, loading }: { tenders: DashboardTender[]; loading: boolean }) {
  return (
    <section className="db-card" aria-labelledby="db-ao-title" data-tour="dashboard-ao-table">
      <div className="db-card-head">
        <h2 id="db-ao-title" className="db-card-title">AO en cours</h2>
        <Link href="/tenders" className="db-link">Voir tous</Link>
      </div>
      <div className="db-side-body">
        {loading ? (
          [0, 1].map(i => <div key={i} className="skeleton" style={{ height: 92, borderRadius: 12 }} />)
        ) : tenders.length === 0 ? (
          <p className="db-row-ctx" style={{ margin: 0 }}>
            Aucun AO en cours. <Link href="/tenders?new=1" className="db-link" style={{ minHeight: 0 }}>Créer un AO</Link>
          </p>
        ) : (
          tenders.map(t => {
            const pill = STATUS_PILL[t.status] ?? STATUS_PILL.nouveau
            const sum = responseSummary(t)
            const deadline = formatDeadline(t.deadline)
            return (
              <Link key={t.tender_id} href={`/tenders/${t.tender_id}`} className="db-tender">
                <div className="db-tender-top">
                  <p className="db-tender-title">{t.title}</p>
                  <span className={`db-pill db-mono ${pill.className}`}>{pill.label}</span>
                </div>
                <p className="db-tender-client">{t.client}</p>
                <ul className="db-tender-meta">
                  <li>{sum.suppliers}</li>
                  <li className={sum.alert ? 'db-red' : undefined}>{sum.responses}</li>
                  <li className={deadline ? undefined : 'db-orange'}>{deadline ? `Limite ${deadline}` : 'Pas de date limite'}</li>
                </ul>
              </Link>
            )
          })
        )}
      </div>
    </section>
  )
}

export function RelaunchCard({ pending }: { pending: number | null }) {
  return (
    <section className="db-dark" aria-label="Relances automatiques">
      <p className="db-dark-label db-mono">Relances automatiques</p>
      <p className="db-dark-text">Operis relance à votre place les fournisseurs silencieux.</p>
      <p className="db-dark-sub">{pending === null ? '…' : pendingRelaunchLabel(pending)}</p>
    </section>
  )
}
