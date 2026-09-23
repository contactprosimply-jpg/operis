'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-client'
import { effectiveMailLanguageLabel } from '@/lib/supplier-languages'
import type { CorpsEtat, Supplier } from '@/types/database'

interface HistoryEntry {
  quote_id: string
  tender_id: string
  tender_title: string
  price_ht: number | null
  is_selected: boolean
  received_at: string
}

interface History {
  quotes: HistoryEntry[]
  price_index: { deviation_pct: number; comparisons_count: number } | null
  response_rate: { responded: number; contacted: number; rate: number } | null
}

const fmtPrice = (v: number | null) => v != null ? `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €` : '—'
const fmtDate = (v: string) => new Date(v).toLocaleDateString('fr-FR')

export default function SupplierDetail({
  supplier, corpsEtats, onBack, onConsult, onDelete,
}: {
  supplier: Supplier
  corpsEtats: CorpsEtat[]
  onBack: () => void
  onConsult: () => void
  onDelete: () => void
}) {
  const [state, setState] = useState<{ id: string; history: History | null; error: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    authFetch(`/api/suppliers/${supplier.id}/history`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        setState({ id: supplier.id, history: json.success ? json.data : null, error: !json.success })
      })
      .catch(() => { if (!cancelled) setState({ id: supplier.id, history: null, error: true }) })
    return () => { cancelled = true }
  }, [supplier.id])

  const loading = state?.id !== supplier.id
  const history = loading ? null : state?.history ?? null
  const failed = !loading && state?.error === true

  const labelFor = (id: string) => corpsEtats.find(c => c.id === id)?.label ?? id
  const rate = history?.response_rate ?? null
  const index = history?.price_index ?? null
  const quotes = history?.quotes ?? []
  const won = quotes.filter(q => q.is_selected).length
  const phone = supplier.phone?.trim()

  return (
    <section className="sp-detail">
      <button type="button" className="sp-back" onClick={onBack}>← Fournisseurs</button>

      <div className="sp-detail-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="sp-name">{supplier.name}</h2>
          <div className="sp-pills">
            {(supplier.corps_etats ?? []).length === 0
              ? <span className="sp-pill sp-pill--todo">À classer</span>
              : supplier.corps_etats.map(id => <span key={id} className="sp-pill">{labelFor(id)}</span>)}
          </div>
        </div>
        <div className="sp-actions">
          {phone
            ? <a className="sp-btn" href={`tel:${phone.replace(/\s+/g, '')}`}>Appeler</a>
            : <span className="sp-btn" aria-disabled="true">Appeler</span>}
          <a className="sp-btn" href={`mailto:${supplier.email}`}>E-mail</a>
          <button type="button" className="sp-btn sp-btn--primary" onClick={onConsult}>Consulter sur un AO</button>
        </div>
      </div>

      <div className="sp-stats">
        <div className="sp-card">
          <div className="sp-label">Taux de réponse</div>
          {loading ? <div className="sp-stat-value sp-stat-value--muted">…</div>
            : rate ? <div className="sp-stat-value">{Math.round(rate.rate * 100)} %</div>
            : <div className="sp-stat-value sp-stat-value--muted">—</div>}
          <div className="sp-stat-note">
            {rate ? `${rate.responded} réponse${rate.responded > 1 ? 's' : ''} sur ${rate.contacted} consultation${rate.contacted > 1 ? 's' : ''}` : loading ? '' : 'Jamais consulté'}
          </div>
        </div>
        <div className="sp-card">
          <div className="sp-label">Devis envoyés</div>
          {loading ? <div className="sp-stat-value sp-stat-value--muted">…</div>
            : <div className="sp-stat-value">{quotes.length}</div>}
          <div className="sp-stat-note">{loading ? '' : quotes.length === 0 ? 'Aucun devis reçu' : `dont ${won} retenu${won > 1 ? 's' : ''}`}</div>
        </div>
        <div className="sp-card">
          <div className="sp-label">Prix vs moyenne</div>
          {loading ? <div className="sp-stat-value sp-stat-value--muted">…</div>
            : index
              ? <div className={`sp-stat-value ${index.deviation_pct < 0 ? 'sp-stat-value--good' : index.deviation_pct > 0 ? 'sp-stat-value--bad' : ''}`}>
                {index.deviation_pct > 0 ? '+' : index.deviation_pct < 0 ? '−' : ''}{Math.abs(Math.round(index.deviation_pct))} %
              </div>
              : <div className="sp-stat-value sp-stat-value--muted">Pas assez de devis</div>}
          <div className="sp-stat-note">
            {index
              ? `${index.deviation_pct < 0 ? 'Moins cher' : 'Plus cher'} que la moyenne, sur ${index.comparisons_count} AO comparés`
              : loading ? '' : 'Il faut au moins 2 AO où d’autres ont chiffré'}
          </div>
        </div>
      </div>

      <div className="sp-card">
        <div className="sp-label">Historique des devis</div>
        {failed ? <div className="sp-empty">Historique indisponible</div>
          : !loading && quotes.length === 0 ? <div className="sp-empty">Aucun devis enregistré pour ce fournisseur.</div>
          : (
            <div className="sp-table-wrap">
              <table className="sp-table">
                <thead><tr><th>AO</th><th>Date</th><th>Montant HT</th><th>Statut</th></tr></thead>
                <tbody>
                  {quotes.map(q => (
                    <tr key={q.quote_id}>
                      <td><Link href={`/tenders/${q.tender_id}`} style={{ color: 'inherit' }}>{q.tender_title}</Link></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(q.received_at)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtPrice(q.price_ht)}</td>
                      <td><span className={`sp-status${q.is_selected ? ' sp-status--won' : ''}`}>{q.is_selected ? 'Retenu' : 'Non retenu'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <div className="sp-card">
        <div className="sp-label">Coordonnées</div>
        <dl className="sp-coords">
          {supplier.contact_name && <div><dt className="sp-label">Contact</dt><dd>{supplier.contact_name}</dd></div>}
          <div><dt className="sp-label">E-mail</dt><dd>{supplier.email}</dd></div>
          {(supplier.additional_emails ?? []).length > 0 && (
            <div><dt className="sp-label">E-mails secondaires</dt><dd>{supplier.additional_emails.join(', ')}</dd></div>
          )}
          <div><dt className="sp-label">Téléphone</dt><dd>{phone || '—'}</dd></div>
          <div><dt className="sp-label">Langue</dt><dd>{supplier.language || 'Français'} <span className="sp-hint">(e-mails en {effectiveMailLanguageLabel(supplier.language)})</span></dd></div>
          {supplier.country && <div><dt className="sp-label">Pays</dt><dd>{supplier.country}</dd></div>}
        </dl>
        {supplier.notes && <p className="sp-hint" style={{ marginTop: 14 }}>{supplier.notes}</p>}
        {supplier.specialty_note && <p className="sp-hint" style={{ marginTop: 6 }}>Note de spécialité : {supplier.specialty_note}</p>}
        <div className="sp-actions" style={{ marginTop: 16 }}>
          <Link className="sp-btn" href={`/suppliers/${supplier.id}/edit`}>Modifier</Link>
          <button type="button" className="sp-btn sp-btn--danger" onClick={onDelete}>Supprimer</button>
        </div>
      </div>
    </section>
  )
}
