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
  if (Number.isNaN(value) || value < 50 || value >= 100_000_000) return null
  return value
}

export function extractPriceFromText(text: string, preferMax = false): number | null {
  if (!text) return null
  const normalized = text.replace(/\u00a0/g, ' ')

  const totalLabelPatterns = [
    /(?:total\s*(?:g[eé]n[eé]ral|ht|ttc|h\.?\s*t\.?)?|montant\s*(?:total|ht|h\.?\s*t\.?)?|net\s*[àa]\s*payer|total\s*devis|total\s*offre|prix\s*total)[^\d]{0,40}(\d[\d\s.,]*)/gi,
    /(?:total|montant)\s*h\.?\s*t\.?\s*[:\s]+(\d[\d\s.,]*)/gi,
  ]
  for (const pattern of totalLabelPatterns) {
    let match: RegExpExecArray | null
    const re = new RegExp(pattern.source, pattern.flags)
    while ((match = re.exec(normalized)) !== null) {
      const value = parseAmount(match[1])
      if (value != null) return value
    }
  }

  const patterns = [
    /(?:montant|total|prix|devis|offre|facturation|tarif)[^\d]{0,30}(\d[\d\s.,]*)\s*€/gi,
    /(\d[\d\s.,]*)\s*€\s*(?:HT|ht|TTC|ttc)?/gi,
    /€\s*(\d[\d\s.,]*)/gi,
    /(\d[\d\s.,]*)\s*(?:EUR|euros?)/gi,
    /(?:total|montant)\s*[:\s]+(\d[\d\s.,]*)/gi,
  ]

  const candidates: number[] = []
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    const re = new RegExp(pattern.source, pattern.flags)
    while ((match = re.exec(normalized)) !== null) {
      const value = parseAmount(match[1])
      if (value != null) candidates.push(value)
    }
  }

  if (candidates.length === 0) return null
  const filtered = candidates.filter(v => v >= 100)
  const pool = filtered.length ? filtered : candidates
  return preferMax ? Math.max(...pool) : Math.min(...pool)
}
