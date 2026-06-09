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
const SUBJECT_AO_PATTERNS = [
  /\bappel d['']offres?\b/i,
  /\b(ao|dce|rfp)\b/i,
  /\bdossier de consultation\b/i,
  /\bconsultation entreprises\b/i,
  /\bmarch[eé] public\b/i,
  /\binvitation [àa] (soumissionner|consulter|proposer)\b/i,
]

const KEYWORDS: { terms: string[]; weight: number }[] = [
  // Très fort (40 pts chacun)
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
  // Fort (25 pts chacun)
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
  'relance de paiement',
  'reset your password',
  'supabase auth',
  'vercel',
]

const OWN_OUTBOUND_PREFIXES = [
  'consultation —',
  'consultation -',
  'relance —',
  'relance -',
  'relance 2 —',
  'relance 2 -',
]

// ── Fonction principale de détection ─────────────────────────
export function detectAo(subject: string, body: string): DetectionResult {
  const cleanSubject = subject.replace(/^(re:|fwd:|tr:|fw:)\s*/gi, '').trim()
  const subjectLower = cleanSubject.toLowerCase()

  for (const prefix of OWN_OUTBOUND_PREFIXES) {
    if (subjectLower.startsWith(prefix)) {
      return { isAo: false, score: 0, matchedKeywords: [] }
    }
  }

  for (const pattern of SUBJECT_AO_PATTERNS) {
    if (pattern.test(cleanSubject)) {
      return { isAo: true, score: 85, matchedKeywords: ['sujet AO'] }
    }
  }

  const text = `${cleanSubject} ${body}`.toLowerCase()
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
  for (const category of KEYWORDS.slice(0, 2)) {
    for (const term of category.terms) {
      if (subjectLower.includes(term.toLowerCase())) {
        score += 15 // bonus sujet
      }
    }
  }

  // Plafonner entre 0 et 100
  score = Math.max(0, Math.min(100, score))

  // Pièces jointes typiques AO dans le corps
  if (/\b(dce|cctp|dpgf|bpu|dqe)\b/i.test(text)) score += 10

  return {
    isAo: score >= 25,
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
