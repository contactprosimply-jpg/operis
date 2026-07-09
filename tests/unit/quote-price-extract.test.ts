import { describe, expect, it } from 'vitest'
import { extractFinalPriceFromText } from '@/lib/quote-price-extract'

describe('quote-price-extract', () => {
  it('extrait un montant avec espace comme séparateur de milliers (format FR)', () => {
    const text = 'Devis n°2026-042\n\nDésignation ... Montant\nTravaux de gros œuvre\n\nTotal HT : 12 345,67 €'
    const { price } = extractFinalPriceFromText(text)
    expect(price).toBe(12345.67)
  })

  it('extrait un gros montant avec espaces sans décimale', () => {
    const text = 'Montant total 125 000 € HT'
    const { price } = extractFinalPriceFromText(text)
    expect(price).toBe(125000)
  })

  it('extrait un montant avec point comme séparateur de milliers', () => {
    const text = 'Total HT 12.345,67'
    const { price } = extractFinalPriceFromText(text)
    expect(price).toBe(12345.67)
  })

  it('extrait un montant simple sans séparateur de milliers', () => {
    const text = 'Montant HT 850,50 €'
    const { price } = extractFinalPriceFromText(text)
    expect(price).toBe(850.5)
  })
})
