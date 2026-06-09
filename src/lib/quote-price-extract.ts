/** Ligne de total — multilingue */
const TOTAL_LINE_LABEL = /total|ukupno|iznos|neto|montant|gesamt|totale|uplatu|placanje|pdv|net\s*[àa]\s*payer|grand\s*total|amount\s*due|za\s*uplatu|za\s*placanje|bez\s*pdv|sa\s*pdv|h\.?\s*t\.?|ttc|net\s*amount/i

const TOTAL_PATTERNS: Array<{ re: RegExp; priority: number; label: string }> = [
  { re: /total\s*h\.?\s*t\.?[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 12, label: 'Total HT' },
  { re: /montant\s*h\.?\s*t\.?[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 12, label: 'Montant HT' },
  { re: /bez\s*pdv[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 12, label: 'Bez PDV' },
  { re: /ukupno\s*bez\s*pdv[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 12, label: 'Ukupno bez PDV' },
  { re: /without\s*vat[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 12, label: 'Without VAT' },
  { re: /neto(?!\s*sa)[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 11, label: 'Neto' },
  { re: /ukupno(?!\s*sa\s*pdv)[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 10, label: 'Ukupno' },
  { re: /iznos[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 10, label: 'Iznos' },
  { re: /gesamtbetrag[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 10, label: 'Gesamtbetrag' },
  { re: /total\s*g[eé]n[eé]ral[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 9, label: 'Total général' },
  { re: /montant\s*total[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 9, label: 'Montant total' },
  { re: /net\s*[àa]\s*payer[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 9, label: 'Net à payer' },
  { re: /za\s*uplatu[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 9, label: 'Za uplatu' },
  { re: /za\s*placanje[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 9, label: 'Za placanje' },
  { re: /total\s*ttc[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 5, label: 'Total TTC' },
  { re: /ukupno\s*sa\s*pdv[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 5, label: 'Ukupno sa PDV' },
  { re: /sa\s*pdv[^\d]{0,80}(\d[\d\s.,]*)/gi, priority: 5, label: 'Sa PDV' },
  { re: /(\d[\d\s.,]*)\s*€\s*(?:HT|ht)\b/gi, priority: 11, label: '€ HT' },
  { re: /(\d[\d\s.,]*)\s*(?:EUR|euros?)\b/gi, priority: 9, label: 'EUR' },
]

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/\u00a0/g, ' ').trim()
  if (!/\d/.test(cleaned)) return null
  let normalized = cleaned
  if (/,\d{1,2}$/.test(normalized) && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.')
  } else if (/,\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(',', '.')
  } else {
    normalized = normalized.replace(/\s/g, '').replace(',', '.')
  }
  const value = parseFloat(normalized)
  if (Number.isNaN(value) || value < 50 || value >= 500_000_000) return null
  return value
}

function extractNumbersFromLine(line: string): number[] {
  const nums: number[] = []
  const re = /(\d{1,3}(?:[\s.]\d{3})+(?:[,.]\d{1,2})?|\d{4,}(?:[,.]\d{1,2})?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    const v = parseAmount(m[1])
    if (v != null) nums.push(v)
  }
  return nums
}

/** Scan les lignes du bas vers le haut — méthode la plus fiable pour les devis. */
function extractFromLinesBottomUp(text: string): { price: number | null; note: string } {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim()).filter(l => l.length > 1)
  const scanFrom = Math.max(0, lines.length - 60)

  for (let i = lines.length - 1; i >= scanFrom; i--) {
    const line = lines[i]
    if (!TOTAL_LINE_LABEL.test(line)) continue

    const nums = extractNumbersFromLine(line)
    if (nums.length) {
      const price = nums[nums.length - 1]
      const short = line.length > 50 ? `${line.slice(0, 50)}…` : line
      return { price, note: `Prix final (${short})` }
    }

    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      const follow = lines[j]
      if (TOTAL_LINE_LABEL.test(follow)) break
      const followNums = extractNumbersFromLine(follow)
      if (followNums.length) {
        return { price: followNums[followNums.length - 1], note: 'Prix final (fin du document)' }
      }
    }
  }

  return { price: null, note: '' }
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
  const tail = matches.slice(-8)
  const htLike = tail.filter(m => m.priority >= 11)
  if (htLike.length) return htLike[htLike.length - 1].value
  const strong = tail.filter(m => m.priority >= 9)
  if (strong.length) return strong[strong.length - 1].value
  return tail[tail.length - 1].value
}

function extractLastAmountFromSection(section: string): number | null {
  const lines = section.split(/\r?\n/).filter(l => l.trim())
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
    const nums = extractNumbersFromLine(lines[i])
    if (nums.length) return nums[nums.length - 1]
  }
  return null
}

/** Extrait le total final depuis les dernières lignes d'un tableau PDF/Excel. */
export function extractPriceFromTableRows(rows: string[][]): { price: number | null; note: string } {
  if (!rows.length) return { price: null, note: '' }

  for (let r = rows.length - 1; r >= Math.max(0, rows.length - 20); r--) {
    const row = rows[r]
    const rowText = row.join(' ')
    if (!TOTAL_LINE_LABEL.test(rowText)) continue

    const nums: number[] = []
    for (const cell of row) {
      const fromCell = extractNumbersFromLine(cell)
      nums.push(...fromCell)
    }
    if (nums.length) {
      return { price: Math.max(...nums), note: 'Prix final (tableau, fin du document)' }
    }
  }

  return { price: null, note: '' }
}

export function extractFinalPriceFromText(
  text: string,
  endSection?: string,
): { price: number | null; note: string } {
  if (!text && !endSection) return { price: null, note: '' }

  const full = text ?? ''
  const tailFromRatio = full.slice(Math.floor(full.length * 0.5))
  const end = (endSection?.trim() || tailFromRatio).trim()

  // 1. Lignes du bas (priorité max)
  const fromLines = extractFromLinesBottomUp(end)
  if (fromLines.price != null) return fromLines

  const fromLinesFull = extractFromLinesBottomUp(full)
  if (fromLinesFull.price != null) return fromLinesFull

  // 2. Labels regex en fin de document
  const endMatches = findAllLabeledTotals(end)
  const fromEnd = pickBestFromMatches(endMatches)
  if (fromEnd != null) {
    const label = endMatches.filter(m => m.value === fromEnd).pop()?.label ?? 'Total'
    return { price: fromEnd, note: `Prix final (${label})` }
  }

  // 3. Dernier label dans le document
  const allMatches = findAllLabeledTotals(full)
  const fromAll = pickBestFromMatches(allMatches)
  if (fromAll != null) {
    const label = allMatches.filter(m => m.value === fromAll).pop()?.label ?? 'Total'
    return { price: fromAll, note: `Prix final (${label})` }
  }

  // 4. Dernier montant en fin de section
  const lastInEnd = extractLastAmountFromSection(end)
  if (lastInEnd != null) {
    return { price: lastInEnd, note: 'Prix final (montant en fin de document)' }
  }

  return { price: null, note: '' }
}

export function extractLargestAmountFromText(text: string): number | null {
  return extractLastAmountFromSection(text.slice(Math.floor(text.length * 0.5)))
}

export function extractPriceFromText(text: string, preferMax = false): number | null {
  if (!text) return null
  const { price } = extractFinalPriceFromText(text)
  if (price != null) return price

  const normalized = text.replace(/\u00a0/g, ' ')
  const candidates: number[] = []
  const re = /(\d[\d\s.,]*)\s*€/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(normalized)) !== null) {
    const value = parseAmount(match[1])
    if (value != null) candidates.push(value)
  }
  if (!candidates.length) return null
  return preferMax ? Math.max(...candidates) : candidates[candidates.length - 1]
}
