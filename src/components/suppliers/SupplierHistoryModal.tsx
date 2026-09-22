'use client'

import { useEffect, useState } from 'react'
import { Modal, Spinner, Badge } from '@/components/ui'
import { authFetch } from '@/lib/auth-client'

interface HistoryEntry {
  quote_id: string
  tender_id: string
  tender_title: string
  tender_deadline: string | null
  price_ht: number | null
  is_selected: boolean
  received_at: string
}

interface HistoryData {
  quotes: HistoryEntry[]
  price_index: { deviation_pct: number; comparisons_count: number } | null
  response_rate: { responded: number; contacted: number; rate: number } | null
}

const fmtPrice = (v: number | null) => v != null ? `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €` : '—'
const fmtDate = (v: string | null) => v ? new Date(v).toLocaleDateString('fr-FR') : '—'

export function SupplierHistoryModal({ open, onClose, supplierId, supplierName }: {
  open: boolean
  onClose: () => void
  supplierId: string | null
  supplierName?: string
}) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<HistoryData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !supplierId) return
    setLoading(true)
    setError(null)
    setData(null)
    authFetch(`/api/suppliers/${supplierId}/history`)
      .then(res => res.json())
      .then(json => {
        if (json.success) setData(json.data)
        else setError(json.error ?? 'Erreur')
      })
      .catch(() => setError('Erreur réseau'))
      .finally(() => setLoading(false))
  }, [open, supplierId])

  return (
    <Modal open={open} onClose={onClose} title={supplierName ? `Historique — ${supplierName}` : 'Historique'} size="lg">
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner size={24} /></div>
      ) : error ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 12 }}>{error}</div>
      ) : !data ? null : (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {data.price_index && (
              <Badge color={data.price_index.deviation_pct > 0 ? 'amber' : 'green'}>
                {data.price_index.deviation_pct > 0 ? '+' : ''}{data.price_index.deviation_pct.toFixed(0)} % vs moyenne sur {data.price_index.comparisons_count} AO
              </Badge>
            )}
            {data.response_rate && (
              <Badge color="blue">
                {Math.round(data.response_rate.rate * 100)} % de réponse ({data.response_rate.responded}/{data.response_rate.contacted})
              </Badge>
            )}
            {!data.price_index && !data.response_rate && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pas encore assez de données pour un indicateur</span>
            )}
          </div>

          {data.quotes.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 12 }}>
              Aucun devis enregistré pour ce fournisseur.
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['AO', 'Date', 'Montant HT', 'Retenu'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.quotes.map(q => (
                    <tr key={q.quote_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--text-primary)' }}>{q.tender_title}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>{fmtDate(q.received_at)}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>{fmtPrice(q.price_ht)}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {q.is_selected ? <Badge color="green">Retenu</Badge> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
