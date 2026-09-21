import {
  responseRateLabel,
  stripUrgentLabel,
  wonLabel,
  type DashboardStats,
} from '@/lib/dashboard-actions'

/** Bande de 4 chiffres : une seule carte, séparée par des traits verticaux. */
export function StatsStrip({ stats, unlinkedQuotes, mailEnabled }: {
  stats: DashboardStats
  /** null tant que la route n'a pas répondu. */
  unlinkedQuotes: number | null
  mailEnabled: boolean
}) {
  const urgent = stripUrgentLabel(stats.urgents)
  const quotesKnown = mailEnabled && unlinkedQuotes !== null

  return (
    <section className="db-card db-strip" aria-label="Chiffres clés" data-tour="dashboard-kpis">
      <div className="db-strip-cell">
        <p className="db-strip-label db-mono">AO actifs</p>
        <p className="db-strip-value">
          <span className="db-strip-num">{stats.actifs}</span>
          <span className={`db-strip-sub ${urgent.tone === 'red' ? 'db-red' : 'db-green'}`}>{urgent.text}</span>
        </p>
      </div>

      <div className="db-strip-cell">
        <p className="db-strip-label db-mono">Taux de réponse</p>
        <p className="db-strip-value">
          <span className="db-strip-num">{stats.tauxReponse} %</span>
          <span className="db-strip-sub">{responseRateLabel(stats)}</span>
        </p>
      </div>

      <div className="db-strip-cell">
        <p className="db-strip-label db-mono">Devis à rattacher</p>
        <p className="db-strip-value">
          <span className={`db-strip-num ${quotesKnown && (unlinkedQuotes ?? 0) > 0 ? 'db-orange' : ''}`}>
            {quotesKnown ? unlinkedQuotes : '—'}
          </span>
          <span className="db-strip-sub">{mailEnabled ? 'reçus par mail' : 'messagerie désactivée'}</span>
        </p>
      </div>

      <div className="db-strip-cell">
        <p className="db-strip-label db-mono">Taux de réussite</p>
        <p className="db-strip-value">
          <span className="db-strip-num">{stats.tauxReussite} %</span>
          <span className="db-strip-sub db-green">{wonLabel(stats.gagnes)}</span>
        </p>
      </div>
    </section>
  )
}
