'use client'

import { useState } from 'react'
import { Modal, Button } from '@/components/ui'
import { CorpsEtatPicker } from '@/components/ui/CorpsEtatPicker'
import { suggestCorpsEtats } from '@/lib/corps-etat-suggest'
import { authFetch } from '@/lib/auth-client'
import { CorpsEtat, Supplier } from '@/types/database'

export function CorpsEtatCategorizeModal({ open, onClose, suppliers, corpsEtats, onDone }: {
  open: boolean
  onClose: () => void
  suppliers: Supplier[]
  corpsEtats: CorpsEtat[]
  onDone: () => void
}) {
  const [selections, setSelections] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(suppliers.map(s => [s.id, suggestCorpsEtats(s.specialty_note)]))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setFor = (id: string, next: string[]) => setSelections(prev => ({ ...prev, [id]: next }))

  const saveAll = async () => {
    setSaving(true)
    setError(null)
    let errors = 0
    for (const s of suppliers) {
      const corps_etats = selections[s.id] ?? []
      // Vide = reste "à classer" (rien à sauvegarder, ce n'est pas une erreur).
      if (corps_etats.length === 0) continue
      const res = await authFetch(`/api/suppliers/${s.id}`, { method: 'PUT', body: JSON.stringify({ corps_etats }) })
      const data = await res.json().catch(() => ({ success: false }))
      if (!data.success) errors++
    }
    setSaving(false)
    if (errors > 0) {
      setError(`${errors} fournisseur(s) non sauvegardé(s) — réessayez`)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Catégoriser les fournisseurs" size="lg">
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Corps d&apos;état suggérés à partir de l&apos;ancienne « spécialité » en texte libre — à valider ou corriger.
        Un fournisseur laissé vide reste « à classer » et n&apos;est simplement pas mis en avant dans les suggestions.
      </div>

      {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{error}</div>}

      <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {suppliers.map(s => (
          <div key={s.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</div>
            {s.specialty_note && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Note : {s.specialty_note}</div>
            )}
            <CorpsEtatPicker options={corpsEtats} value={selections[s.id] ?? []} onChange={next => setFor(s.id, next)} />
          </div>
        ))}
        {suppliers.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 12 }}>
            Tous vos fournisseurs sont classés.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <Button variant="ghost" onClick={onClose}>Plus tard</Button>
        <Button variant="primary" onClick={saveAll} loading={saving} disabled={suppliers.length === 0}>Valider tout</Button>
      </div>
    </Modal>
  )
}
