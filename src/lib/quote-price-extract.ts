/** Labels « total » multilingues — le prix final est en fin de devis. */
const TOTAL_PATTERNS: Array<{ re: RegExp; priority: number; label: string }> = [
  { re: /total\s*h\.?\s*t\.?[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 12, label: 'Total HT' },
  { re: /montant\s*h\.?\s*t\.?[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 12, label: 'Montant HT' },
  { re: /net\s*h\.?\s*t\.?[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 12, label: 'Net HT' },
  { re: /bez\s*pdv[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 12, label: 'Bez PDV' },
  { re: /ukupno\s*bez\s*pdv[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 12, label: 'Ukupno bez PDV' },
  { re: /without\s*vat[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 12, label: 'Without VAT' },
  { re: /net\s*amount[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 11, label: 'Net amount' },
  { re: /neto[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 11, label: 'Neto' },
  { re: /ukupno[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 10, label: 'Ukupno' },
  { re: /iznos[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 10, label: 'Iznos' },
  { re: /gesamtbetrag[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 10, label: 'Gesamtbetrag' },
  { re: /gesamt\s*preis[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 10, label: 'Gesamtpreis' },
  { re: /totale[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 10, label: 'Totale' },
  { re: /importe\s*total[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 10, label: 'Importe total' },
  { re: /total\s*g[eé]n[eé]ral[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 9, label: 'Total général' },
  { re: /montant\s*total[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 9, label: 'Montant total' },
  { re: /net\s*[àa]\s*payer[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 9, label: 'Net à payer' },
  { re: /grand\s*total[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 9, label: 'Grand total' },
  { re: /za\s*uplatu[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 9, label: 'Za uplatu' },
  { re: /za\s*placanje[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 9, label: 'Za placanje' },
  { re: /ponuda[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 8, label: 'Ponuda' },
  { re: /vrijednost[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 8, label: 'Vrijednost' },
  { re: /cena[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 7, label: 'Cena' },
  { re: /total\s*ttc[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 6, label: 'Total TTC' },
  { re: /sa\s*pdv[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 6, label: 'Sa PDV' },
  { re: /ukupno\s*sa\s*pdv[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 6, label: 'Ukupno sa PDV' },
  { re: /(?:^|\n)\s*total[^\d]{0,60}(\d[\d\s.,]*)/gi, priority: 8, label: 'Total' },
  { re: /(?:montant|total|prix)\s*[:\s]+(\d[\d\s.,]*)\s*€/gi, priority: 8, label: 'Montant €' },
  { re: /(\d[\d\s.,]*)\s*€\s*(?:HT|ht)\b/gi, priority: 11, label: '€ HT' },
  { re: /(\d[\d\s.,]*)\s*(?:EUR|euros?)\s*(?:HT|ht)?/gi, priority: 9, label: 'EUR' },
]

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\u00a0/g, ' ').trim()
  let normalized = cleaned
  if (/,\d{2}$/.test(normalized) && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.')
  } else if (/,\d{2}$/.test(normalized)) {
    normalized = normalized.replace(',', '.')
  } else {
    normalized = normalized.replace(/\s/g, '').replace(',', '.')
  }
  const value = parseFloat(normalized)
  if (Number.isNaN(value) || value < 50 || value >= 500_000_000) return null
  return value
}

interface TotalMatch {
  value: number
  index: number
  priority: number
  label: string
}

function findAllLabeledTotals(text: string): TotalMatch[] {
  const matches: TotalMatch[] = []
  for (const { re, priority, label } of TOTAL_PATTERNS) {
    const regex = new RegExp(re.source, re.flags)
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      const value = parseAmount(m[1])
      if (value != null) matches.push({ value, index: m.index, priority, label })
    }
  }
  return matches.sort((a, b) => a.index - b.index)
}

function pickBestFromMatches(matches: TotalMatch[]): number | null {
  if (!matches.length) return null
  const tail = matches.slice(-6)
  const htLike = tail.filter(m => m.priority >= 11)
  if (htLike.length) return htLike[htLike.length - 1].value
  const strong = tail.filter(m => m.priority >= 9)
  if (strong.length) return strong[strong.length - 1].value
  return tail[tail.length - 1].value
}

function extractLastAmountFromSection(section: string): number | null {
  const re = /(?<![\d])(\d{1,3}(?:[\s.]\d{3})+(?:[,.]\d{2})?|\d{4,}(?:[,.]\d{2})?)(?![\d])/g
  let last: number | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(section)) !== null) {
    const v = parseAmount(m[1])
    if (v != null && v >= 100) last = v
  }
  return last
}

/**
 * Extrait le prix final en fin de document (dernière page / dernière section).
 * Ne prend pas le plus grand montant du milieu du devis.
 */
export function extractFinalPriceFromText(
  text: string,
  endSection?: string,
): { price: number | null; note: string } {
  if (!text && !endSection) return { price: null, note: '' }

  const full = text ?? ''
  const tailFromRatio = full.slice(Math.floor(full.length * 0.55))
  const end = (endSection?.trim() || tailFromRatio).trim()

  // 1. Labels explicites en fin de document
  const endMatches = findAllLabeledTotals(end)
  const fromEnd = pickBestFromMatches(endMatches)
  if (fromEnd != null) {
    const label = endMatches.filter(m => m.value === fromEnd).pop()?.label ?? 'Total'
    return { price: fromEnd, note: `Prix final (${label}, fin du document)` }
  }

  // 2. Dernier label dans le document entier
  const allMatches = findAllLabeledTotals(full)
  const fromAll = pickBestFromMatches(allMatches)
  if (fromAll != null) {
    const label = allMatches.filter(m => m.value === fromAll).pop()?.label ?? 'Total'
    return { price: fromAll, note: `Prix final (${label})` }
  }

  // 3. Dernier montant significatif en fin de document
  const lastInEnd = extractLastAmountFromSection(end)
  if (lastInEnd != null) {
    return { price: lastInEnd, note: 'Prix final (montant en fin de document)' }
  }

  return { price: null, note: '' }
}

/** Dernier recours — uniquement sur la fin du texte. */
export function extractLargestAmountFromText(text: string): number | null {
  const end = text.slice(Math.floor(text.length * 0.55))
  return extractLastAmountFromSection(end)
}

/** Corps d'email court — premier total trouvé suffit. */
export function extractPriceFromText(text: string, preferMax = false): number | null {
  if (!text) return null
  if (text.length > 800) {
    return extractFinalPriceFromText(text).price
  }

  const { price } = extractFinalPriceFromText(text)
  if (price != null) return price

  const normalized = text.replace(/\u00a0/g, ' ')
  const candidates: number[] = []
  const patterns = [
    /(\d[\d\s.,]*)\s*€/gi,
    /(\d[\d\s.,]*)\s*(?:EUR|euros?)/gi,
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    const re = new RegExp(pattern.source, pattern.flags)
    while ((match = re.exec(normalized)) !== null) {
      const value = parseAmount(match[1])
      if (value != null) candidates.push(value)
    }
  }
  if (!candidates.length) return null
  return preferMax ? Math.max(...candidates) : candidates[candidates.length - 1]
}
