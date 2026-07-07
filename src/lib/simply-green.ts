/** Programme Simply Green — partenariat Operis × Reforest'Action */

export const SIMPLY_GREEN_PROGRAM = {
  name: 'Simply Green',
  tagline: 'Chaque mois d\'abonnement finance la plantation d\'un arbre pour réduire l\'empreinte carbone du secteur du bâtiment.',
  rule: '1 mois d\'abonnement = 1 arbre planté',
  partner: 'Reforest\'Action',
  partnerUrl: 'https://www.reforestaction.com',
  partnerDescription:
    'Organisation française reconnue par les entreprises, avec un haut niveau de transparence et des outils adaptés aux partenariats B2B.',
} as const

const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000

/** Nombre de mois pleins écoulés depuis le début d'un abonnement (1 arbre / mois). */
export function treesForSubscription(createdAt: string | null | undefined, hasEverSubscribed: boolean): number {
  if (!hasEverSubscribed || !createdAt) return 0
  const elapsedMs = Date.now() - new Date(createdAt).getTime()
  if (elapsedMs <= 0) return 0
  return Math.max(1, Math.floor(elapsedMs / MS_PER_MONTH))
}

export function co2TonnesPerTree(): number {
  // Estimation Reforest'Action : ~25 kg de CO2 absorbé par arbre sur sa durée de vie moyenne.
  return 0.025
}

export function estimateCo2Tonnes(trees: number): number {
  if (trees <= 0) return 0
  return Math.round(trees * co2TonnesPerTree() * 10) / 10
}
