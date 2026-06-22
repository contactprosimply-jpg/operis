// ============================================================
// OPERIS — services/aoDetector.service.ts
// Détection automatique des AO dans les emails
// Score de 0 à 100 — au dessus de 30 = AO probable
// ============================================================

import { billingVeto } from '@/lib/ao-billing-veto'

export interface DetectionResult {
  isAo: boolean
  score: number
  matchedKeywords: string[]
  excludedReason?: string | null
}

const SUBJECT_AO_PATTERNS = [
  /\bappel d['']offres?\b/i,
  /\b(ao|dce|rfp)\b/i,
  /\bdossier de consultation\b/i,
  /\bconsultation entreprises\b/i,
  /\bmarch[eé] public\b/i,
  /\binvitation [àa] (soumissionner|consulter|proposer)\b/i,
]

const KEYWORDS: { terms: string[]; weight: number }[] = [
  {
    weight: 40,
    terms: [
      'appel d\'offres',
      'appel d\'offre',
      'dce',
      'dossier de consultation',
      'dossier de consultation des entreprises',
      'rfp',
      'request for proposal',
      'marché public',
      'consultation entreprises',
    ],
  },
  {
    weight: 25,
    terms: [
      'consultation',
      'mise en concurrence',
      'marché',
      'ao ',
      ' ao,',
      ' ao-',
      'tender',
      'bid',
      'soumission',
      'offre ferme',
      'remise des offres',
      'date limite de réponse',
      'date limite de reponse',
      'candidature',
      'invitation à soumissionner',
      'invitation a soumissionner',
      'acte d\'engagement',
      'mémoire technique',
      'memoire technique',
    ],
  },
  {
    weight: 15,
    terms: [
      'cahier des charges',
      'cctp',
      'dpgf',
      'bpu',
      'dqe',
      'demande d\'offre',
      'demande d\'offres',
    ],
  },
  {
    weight: 8,
    terms: [
      'lot ',
      'travaux',
      'chantier',
      'réhabilitation',
      'construction',
      'rénovation',
      'date limite',
      'délai de réponse',
      'remise des offres',
    ],
  },
]

const NEGATIVE_KEYWORDS = [
  'désabonner',
  'unsubscribe',
  'newsletter',
  'promotion',
  'soldes',
  'offre spéciale',
  'reset your password',
  'supabase auth',
  'vercel',
  'veuillez trouver',
  'ci-joint notre offre',
  'ci joint notre offre',
  'notre proposition',
  'suite à votre demande',
  'suite a votre demande',
  'en réponse à',
  'en reponse a',
  'devis n°',
  'devis n ',
  'chiffrage',
  'notre devis',
  'ponuda',
]

const OWN_OUTBOUND_PREFIXES = [
  'consultation —',
  'consultation -',
  'relance —',
  'relance -',
  'relance 2 —',
  'relance 2 -',
]

/** Réponse fournisseur (devis/chiffrage) — pas une demande AO entrante. */
export function looksLikeSupplierQuoteEmail(subject: string, body: string): boolean {
  const text = `${subject} ${body}`.toLowerCase()
  const replyPhrases = [
    'veuillez trouver',
    'ci-joint notre',
    'ci joint notre',
    'notre proposition',
    'suite à votre',
    'suite a votre',
    'en réponse à',
    'en reponse a',
    'devis n°',
    'devis n ',
    'offre n°',
    'notre devis',
    'ponuda',
    'notre offre',
  ]
  if (replyPhrases.some(p => text.includes(p))) return true
  const hasQuoteWord = /devis|chiffrage|offre de prix|proposition commerciale|ponuda/i.test(text)
  const hasAmount = /€|euros|\beur\b|\bht\b|\bttc\b|\d[\d\s.,]{3,}\s*€/i.test(text)
  return hasQuoteWord && hasAmount
}

export function detectAo(subject: string, body: string): DetectionResult {
  const veto = billingVeto(subject, body)
  if (veto) {
    return { isAo: false, score: 0, matchedKeywords: [], excludedReason: veto }
  }

  const cleanSubject = subject.replace(/^(re:|fwd:|tr:|fw:)\s*/gi, '').trim()
  const subjectLower = cleanSubject.toLowerCase()

  for (const prefix of OWN_OUTBOUND_PREFIXES) {
    if (subjectLower.startsWith(prefix)) {
      return { isAo: false, score: 0, matchedKeywords: [] }
    }
  }

  const text = `${cleanSubject} ${body}`.toLowerCase()

  if (looksLikeSupplierQuoteEmail(cleanSubject, body)) {
    return { isAo: false, score: 0, matchedKeywords: ['réponse devis'] }
  }

  for (const pattern of SUBJECT_AO_PATTERNS) {
    if (pattern.test(cleanSubject)) {
      return { isAo: true, score: 85, matchedKeywords: ['sujet AO'] }
    }
  }

  const matchedKeywords: string[] = []
  let score = 0

  for (const category of KEYWORDS) {
    for (const term of category.terms) {
      if (text.includes(term.toLowerCase())) {
        score += category.weight
        matchedKeywords.push(term.trim())
      }
    }
  }

  for (const neg of NEGATIVE_KEYWORDS) {
    if (text.includes(neg.toLowerCase())) {
      score -= 25
    }
  }

  for (const category of KEYWORDS.slice(0, 2)) {
    for (const term of category.terms) {
      if (subjectLower.includes(term.toLowerCase())) {
        score += 15
      }
    }
  }

  score = Math.max(0, Math.min(100, score))

  if (/\b(dce|cctp|dpgf|bpu|dqe)\b/i.test(text)) score += 10

  if (looksLikeSupplierQuoteEmail(cleanSubject, body)) {
    score = 0
  }

  return {
    isAo: score >= 25,
    score,
    matchedKeywords: [...new Set(matchedKeywords)],
  }
}

export function extractTenderTitle(subject: string): string {
  return subject
    .replace(/^(re:|fwd:|tr:|fw:)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractClientFromEmail(fromAddress: string): string {
  const emailMatch = fromAddress.match(/<(.+)>/)
  const email = emailMatch ? emailMatch[1] : fromAddress
  const domainMatch = email.match(/@([^.]+)/)
  if (!domainMatch) return fromAddress
  const domain = domainMatch[1]
  return domain.charAt(0).toUpperCase() + domain.slice(1)
}
