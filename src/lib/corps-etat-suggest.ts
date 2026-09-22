// ============================================================
// OPERIS — lib/corps-etat-suggest.ts
// Suggestion (best-effort, mots-clés) de corps d'état à partir de l'ancien
// texte libre "spécialité" — utilisé UNIQUEMENT pour pré-cocher la revue
// manuelle de catégorisation ponctuelle des fournisseurs existants.
// Ne sert jamais à faire correspondre un AO à un fournisseur : une fois
// classés, la correspondance se fait par intersection d'ids exacte.
// ============================================================

const KEYWORD_MAP: Record<string, string[]> = {
  gros_oeuvre: ['maçon', 'macon', 'gros œuvre', 'gros oeuvre', 'béton', 'beton', 'coffrage'],
  terrassement_vrd: ['terrassement', 'vrd', 'voirie', 'réseaux', 'reseaux'],
  charpente: ['charpente', 'charpentier'],
  couverture_etancheite: ['couverture', 'couvreur', 'étanchéité', 'etancheite', 'zinguerie'],
  menuiseries_exterieures: ['menuiserie ext', 'fenêtre', 'fenetre', 'alu', 'pvc', 'volet'],
  menuiseries_interieures: ['menuiserie int', 'porte int', 'placard', 'agencement bois'],
  serrurerie_metallerie: ['serrurerie', 'métallerie', 'metallerie', 'ferronnerie', 'garde-corps'],
  platrerie_isolation: ['plâtrerie', 'platrerie', 'isolation', 'cloison', 'faux plafond', 'placo'],
  peinture_revetements_muraux: ['peinture', 'peintre', 'revêtement mural', 'revetement mural', 'papier peint'],
  carrelage_revetements_sols: ['carrelage', 'carreleur', 'revêtement de sol', 'revetement de sol', 'parquet'],
  electricite: ['électricité', 'electricite', 'électricien', 'electricien', 'cfo', 'cfa'],
  plomberie_sanitaire: ['plomberie', 'plombier', 'sanitaire'],
  cvc: ['chauffage', 'climatisation', 'clim', 'ventilation', 'cvc'],
  ascenseurs: ['ascenseur', 'monte-charge', 'monte charge'],
  espaces_verts: ['espace vert', 'paysag', 'jardin'],
}

export function suggestCorpsEtats(specialtyNote: string | null | undefined): string[] {
  if (!specialtyNote) return []
  const text = specialtyNote.toLowerCase()
  const matches: string[] = []
  for (const [corpsEtatId, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(k => text.includes(k))) matches.push(corpsEtatId)
  }
  return matches
}
