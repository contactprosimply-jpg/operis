// ============================================================
// OPERIS — services/aoDetector.service.ts
// Détection automatique des AO dans les emails
// Score de 0 à 100 — au dessus de 30 = AO probable
// ============================================================

export interface DetectionResult {
  isAo: boolean
  score: number
  matchedKeywords: string[]
}

// ── Mots clés par catégorie avec leur poids ──────────────────
const KEYWORDS: { terms: string[]; weight: number }[] = [
  // Très fort (40 pts chacun)
  {
    weight: 40,
    terms: [
      'appel d\'offres',
      'appel d\'offre',
      'dce',
      'dossier de consultation',
      'rfp',
      'request for proposal',
    ],
  },
  // Fort (25 pts chacun)
  {
    weight: 25,
    terms: [
      'consultation',
      'mise en concurrence',
      'marché',
      'ao ',
      ' ao,',
      'tender',
      'bid',
      'soumission',
    ],
  },
  // Moyen (15 pts chacun)
  {
    weight: 15,
    terms: [
      'devis',
      'offre de prix',
      'proposition commerciale',
      'cahier des charges',
      'cctp',
      'dpgf',
      'bpu',
      'dqe',
    ],
  },
  // Signal faible (8 pts chacun)
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

// ── Mots qui diminuent le score (spam, newsletters, etc.) ────
const NEGATIVE_KEYWORDS = [
  'désabonner',
  'unsubscribe',
  'newsletter',
  'promotion',
  'soldes',
  'offre spéciale',
  'facture',
  'règlement',
  'relance de paiement',
]

// ── Fonction principale de détection ─────────────────────────
export function detectAo(subject: string, body: string): DetectionResult {
  const text = `${subject} ${body}`.toLowerCase()
  const matchedKeywords: string[] = []
  let score = 0

  // Appliquer les mots clés positifs
  for (const category of KEYWORDS) {
    for (const term of category.terms) {
      if (text.includes(term.toLowerCase())) {
        score += category.weight
        matchedKeywords.push(term.trim())
      }
    }
  }

  // Appliquer les mots clés négatifs
  for (const neg of NEGATIVE_KEYWORDS) {
    if (text.includes(neg.toLowerCase())) {
      score -= 20
    }
  }

  // Bonus si mots clés forts dans le sujet (sujet = plus important)
  const subjectLower = subject.toLowerCase()
  for (const category of KEYWORDS.slice(0, 2)) {
    for (const term of category.terms) {
      if (subjectLower.includes(term.toLowerCase())) {
        score += 15 // bonus sujet
      }
    }
  }

  // Plafonner entre 0 et 100
  score = Math.max(0, Math.min(100, score))

  return {
    isAo: score >= 30,
    score,
    matchedKeywords: [...new Set(matchedKeywords)], // dédupliquer
  }
}

// ── Extraire un titre propre depuis l'email ──────────────────
export function extractTenderTitle(subject: string): string {
  // Nettoyer les préfixes email communs
  return subject
    .replace(/^(re:|fwd:|tr:|fw:)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Extraire le client depuis l'adresse email ─────────────────
export function extractClientFromEmail(fromAddress: string): string {
  // Ex: "Jean Dupont <jean@nexity.fr>" → "Nexity"
  const emailMatch = fromAddress.match(/<(.+)>/)
  const email = emailMatch ? emailMatch[1] : fromAddress

  const domainMatch = email.match(/@([^.]+)/)
  if (!domainMatch) return fromAddress

  // Capitaliser le nom de domaine
  const domain = domainMatch[1]
  return domain.charAt(0).toUpperCase() + domain.slice(1)
}
