import { describe, it, expect } from 'vitest'
import { headerHasExactAddress, parseAddresses, supplierAddresses } from '@/lib/supplier-address'
import { mergeExchanges, type SupplierExchange } from '@/lib/supplier-exchanges'

describe('rapprochement par adresse exacte', () => {
  it('extrait les adresses d’un en-tête avec noms', () => {
    expect(parseAddresses('"Martin, Paul" <Paul@Martin.fr>, autre@x.fr')).toEqual(['paul@martin.fr', 'autre@x.fr'])
  })
  it('exact : casse ignorée', () => {
    expect(headerHasExactAddress('Paul <PAUL@martin.fr>', 'paul@martin.fr')).toBe(true)
  })
  it('jamais par domaine', () => {
    expect(headerHasExactAddress('autre@martin.fr', 'paul@martin.fr')).toBe(false)
  })
  it('jamais par sous-chaîne', () => {
    expect(headerHasExactAddress('xpaul@martin.fr', 'paul@martin.fr')).toBe(false)
    expect(headerHasExactAddress('paul@martin.fr.evil.com', 'paul@martin.fr')).toBe(false)
  })
  it('adresses du fournisseur : principale + secondaires, sans doublon', () => {
    expect(supplierAddresses({ email: 'A@x.fr', additional_emails: ['b@x.fr', 'a@x.fr'] })).toEqual(['a@x.fr', 'b@x.fr'])
  })
})

const ex = (
  id: string, direction: 'sent' | 'received', subject: string, date: string,
  source: 'email' | 'consultation' = 'email',
): SupplierExchange => ({ id, direction, subject, date, source })

describe('fusion des derniers échanges', () => {
  it('ne compte pas deux fois une consultation journalisée puis importée du dossier Envoyés', () => {
    const merged = mergeExchanges(
      [ex('e1', 'sent', 'Consultation — Lot 3', '2026-09-20T10:03:00Z')],
      [ex('log-1', 'sent', 'Consultation — Lot 3', '2026-09-20T10:00:00Z', 'consultation')],
    )
    expect(merged.map(m => m.id)).toEqual(['e1'])
  })
  it('garde la consultation sans copie importée, du plus récent au plus ancien', () => {
    const merged = mergeExchanges(
      [ex('e1', 'received', 'Re: Devis', '2026-09-22T09:00:00Z')],
      [ex('log-1', 'sent', 'Consultation — Lot 3', '2026-09-20T10:00:00Z', 'consultation')],
    )
    expect(merged.map(m => m.id)).toEqual(['e1', 'log-1'])
  })
  it('limite à 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => ex(`e${i}`, 'sent', `s${i}`, `2026-09-${10 + i}T10:00:00Z`))
    expect(mergeExchanges(many, [])).toHaveLength(8)
  })
})
