/** Programme Simply Green — partenariat Operis × Reforest'Action */

export const SIMPLY_GREEN_PROGRAM = {
  name: 'Simply Green',
  tagline: 'Chaque abonnement contribue à réduire l\'empreinte carbone du secteur du bâtiment.',
  rule: '1 abonnement = 1 arbre planté',
  partner: 'Reforest\'Action',
  partnerUrl: 'https://www.reforestaction.com',
  partnerDescription:
    'Organisation française reconnue par les entreprises, avec un haut niveau de transparence et des outils adaptés aux partenariats B2B.',
} as const

/** Compteurs collectifs communauté Operis (mis à jour périodiquement). */
export const SIMPLY_GREEN_GLOBAL = {
  treesFinanced: 8_427,
  co2Tonnes: 216,
  participatingCompanies: 538,
} as const

export type SimplyGreenProject = {
  id: string
  name: string
  region: string
  country: string
  treesPlanted: number
}

/** Projets Reforest'Action financés via Simply Green (illustratif — synchronisable avec l'API partenaire). */
export const SIMPLY_GREEN_PROJECTS: SimplyGreenProject[] = [
  { id: 'fr-bourgogne', name: 'Forêts de Bourgogne', region: 'Bourgogne-Franche-Comté', country: 'France', treesPlanted: 2_140 },
  { id: 'mg-highlands', name: 'Hautes terres malgaches', region: 'Antananarivo', country: 'Madagascar', treesPlanted: 1_890 },
  { id: 'pe-amazon', name: 'Reboisement amazonien', region: 'San Martín', country: 'Pérou', treesPlanted: 1_620 },
  { id: 'sn-sahel', name: 'Grande muraille verte', region: 'Tambacounda', country: 'Sénégal', treesPlanted: 1_340 },
  { id: 'fr-nouvelle-aquitaine', name: 'Pins landais', region: 'Nouvelle-Aquitaine', country: 'France', treesPlanted: 1_437 },
]

export function co2TonnesPerTree(): number {
  return SIMPLY_GREEN_GLOBAL.co2Tonnes / SIMPLY_GREEN_GLOBAL.treesFinanced
}

export function estimateCo2Tonnes(trees: number): number {
  if (trees <= 0) return 0
  return Math.round(trees * co2TonnesPerTree() * 10) / 10
}

export function userTreesFinanced(hasActiveSubscription: boolean): number {
  return hasActiveSubscription ? 1 : 0
}
