import type { AoKeyword } from '@/lib/ao-keywords'
import type { AoKeywordCategory } from '@/lib/ao-keywords'
import { billingVeto } from '@/lib/ao-billing-veto'

export type { AoKeywordCategory }

export interface AoEmailAnalysis {
  score: number
  categories: Partial<Record<AoKeywordCategory, number>>
  matchedKeywords: string[]
  isAO: boolean
  dominantCategory: AoKeywordCategory | null
  excludedReason?: string | null
}

export function analyzeEmailWithKeywords(
  subject: string,
  body: string,
  keywords: AoKeyword[],
  threshold = 5,
): AoEmailAnalysis {
  const veto = billingVeto(subject, body)
  if (veto) {
    return {
      score: 0,
      categories: {},
      matchedKeywords: [],
      isAO: false,
      dominantCategory: null,
      excludedReason: veto,
    }
  }

  const text = `${subject} ${body}`.toLowerCase()
  let score = 0
  const categories: Partial<Record<AoKeywordCategory, number>> = {}
  const matchedKeywords: string[] = []

  for (const kw of keywords) {
    const needle = kw.keyword.toLowerCase()
    if (!needle || !text.includes(needle)) continue
    score += kw.weight
    categories[kw.category] = (categories[kw.category] ?? 0) + kw.weight
    matchedKeywords.push(kw.keyword)
  }

  const dominantCategory = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])[0]?.[0] as AoKeywordCategory | undefined

  return {
    score,
    categories,
    matchedKeywords,
    isAO: score >= threshold,
    dominantCategory: dominantCategory ?? null,
  }
}

export function aoDetectionDisplayScore(score: number): number {
  return Math.min(100, score * 5)
}

export const AO_CATEGORY_BADGE: Record<AoKeywordCategory, { label: string; color: string; emoji: string }> = {
  detection: { label: 'AO détecté', color: '#3B7FE8', emoji: '📋' },
  question: { label: 'Question client', color: '#f59e0b', emoji: '⚡' },
  reponse: { label: 'Répondu', color: '#22c55e', emoji: '💬' },
  relance: { label: 'Relance', color: '#f97316', emoji: '🟠' },
  refus: { label: 'Refus', color: '#ef4444', emoji: '⚫' },
  acceptation: { label: 'Accepté', color: '#10b981', emoji: '🟢' },
}
