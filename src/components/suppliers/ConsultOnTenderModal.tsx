'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Modal, Spinner } from '@/components/ui'
import { authFetch } from '@/lib/auth-client'
import type { Supplier, TenderStats } from '@/types/database'

const OPEN_STATUSES = ['nouveau', 'en_cours', 'urgence']

// Ajoute le fournisseur à la consultation de l'AO choisi (route existante) — l'envoi du mail
// se fait ensuite depuis la page de l'AO, comme d'habitude.
export default function ConsultOnTenderModal({ open, onClose, supplier }: {
  open: boolean
  onClose: () => void
  supplier: Supplier | null
}) {
  const [tenders, setTenders] = useState<TenderStats[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [addedId, setAddedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    authFetch('/api/tenders')
      .then(r => r.json())
      .then(json => { if (!cancelled) setTenders(json.success ? (json.data as TenderStats[]).filter(t => OPEN_STATUSES.includes(t.status)) : []) })
      .catch(() => { if (!cancelled) setTenders([]) })
    return () => { cancelled = true }
  }, [open])

  const add = async (tenderId: string) => {
    if (!supplier) return
    setBusyId(tenderId)
    setError(null)
    try {
      const res = await authFetch(`/api/tenders/${tenderId}/suppliers`, { method: 'POST', body: JSON.stringify({ supplier_id: supplier.id }) })
      const json = await res.json()
      if (json.success) setAddedId(tenderId)
      else setError(json.error ?? 'Erreur')
    } catch {
      setError('Erreur réseau')
    }
    setBusyId(null)
  }

  return (
    <Modal open={open} onClose={() => { setAddedId(null); setError(null); onClose() }} title={supplier ? `Consulter ${supplier.name}` : 'Consulter'}>
      {tenders === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner size={22} /></div>
      ) : tenders.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 13 }}>Aucun AO ouvert.</div>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          {tenders.map(t => (
            <div key={t.tender_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.client}</div>
              </div>
              {addedId === t.tender_id ? (
                <Link href={`/tenders/${t.tender_id}`} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap' }}>Ajouté — ouvrir l’AO</Link>
              ) : (
                <button type="button" className="sp-btn" disabled={busyId === t.tender_id} onClick={() => add(t.tender_id)}>Ajouter</button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
