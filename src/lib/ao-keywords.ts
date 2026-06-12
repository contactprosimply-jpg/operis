import type { SupabaseClient } from '@supabase/supabase-js'

export type AoKeywordCategory =
  | 'detection'
  | 'question'
  | 'reponse'
  | 'relance'
  | 'refus'
  | 'acceptation'

export interface AoKeyword {
  id: string
  keyword: string
  category: AoKeywordCategory
  weight: number
  created_at?: string
}

export const AO_KEYWORD_CATEGORY_LABELS: Record<AoKeywordCategory, string> = {
  detection: 'Détection AO',
  question: 'Question client',
  reponse: 'Réponse / suivi',
  relance: 'Relance',
  refus: 'Refus',
  acceptation: 'Acceptation',
}

export const DEFAULT_AO_KEYWORDS: Omit<AoKeyword, 'id' | 'created_at'>[] = [
  { keyword: 'appel d\'offres', category: 'detection', weight: 5 },
  { keyword: 'appel d offres', category: 'detection', weight: 5 },
  { keyword: 'consultation', category: 'detection', weight: 4 },
  { keyword: 'dossier de consultation', category: 'detection', weight: 5 },
  { keyword: 'DCE', category: 'detection', weight: 5 },
  { keyword: 'CCTP', category: 'detection', weight: 5 },
  { keyword: 'CCAP', category: 'detection', weight: 5 },
  { keyword: 'BPU', category: 'detection', weight: 4 },
  { keyword: 'DQE', category: 'detection', weight: 4 },
  { keyword: 'mémoire technique', category: 'detection', weight: 4 },
  { keyword: 'offre de prix', category: 'detection', weight: 4 },
  { keyword: 'devis', category: 'detection', weight: 3 },
  { keyword: 'soumission', category: 'detection', weight: 4 },
  { keyword: 'marché public', category: 'detection', weight: 5 },
  { keyword: 'marché de travaux', category: 'detection', weight: 5 },
  { keyword: 'candidature', category: 'detection', weight: 3 },
  { keyword: 'remise des offres', category: 'detection', weight: 5 },
  { keyword: 'date limite', category: 'detection', weight: 3 },
  { keyword: 'tranche ferme', category: 'detection', weight: 4 },
  { keyword: 'tranche conditionnelle', category: 'detection', weight: 4 },
  { keyword: 'question', category: 'question', weight: 3 },
  { keyword: 'demande de précision', category: 'question', weight: 4 },
  { keyword: 'pouvez-vous préciser', category: 'question', weight: 4 },
  { keyword: 'merci de confirmer', category: 'question', weight: 4 },
  { keyword: 'quel est le délai', category: 'question', weight: 3 },
  { keyword: 'avez-vous bien reçu', category: 'question', weight: 3 },
  { keyword: 'suite à votre offre', category: 'question', weight: 4 },
  { keyword: 'concernant votre devis', category: 'question', weight: 4 },
  { keyword: 'suite à notre échange', category: 'reponse', weight: 3 },
  { keyword: 'comme convenu', category: 'reponse', weight: 3 },
  { keyword: 'faisant suite', category: 'reponse', weight: 3 },
  { keyword: 'en réponse à', category: 'reponse', weight: 4 },
  { keyword: 'ci-joint', category: 'reponse', weight: 2 },
  { keyword: 'veuillez trouver', category: 'reponse', weight: 2 },
  { keyword: 'sans réponse de votre part', category: 'relance', weight: 4 },
  { keyword: 'relance', category: 'relance', weight: 4 },
  { keyword: 'nous n\'avons pas reçu', category: 'relance', weight: 4 },
  { keyword: 'nous vous relançons', category: 'relance', weight: 5 },
  { keyword: 'toujours en attente', category: 'relance', weight: 4 },
  { keyword: 'rappel', category: 'relance', weight: 3 },
  { keyword: 'nous avons le regret', category: 'refus', weight: 5 },
  { keyword: 'n\'avons pas retenu', category: 'refus', weight: 5 },
  { keyword: 'votre offre n\'a pas été', category: 'refus', weight: 5 },
  { keyword: 'infructueux', category: 'refus', weight: 4 },
  { keyword: 'sans suite', category: 'refus', weight: 4 },
  { keyword: 'ne donnera pas suite', category: 'refus', weight: 5 },
  { keyword: 'offre moins disante', category: 'refus', weight: 4 },
  { keyword: 'retenu', category: 'acceptation', weight: 5 },
  { keyword: 'votre offre a été retenue', category: 'acceptation', weight: 5 },
  { keyword: 'nous avons le plaisir', category: 'acceptation', weight: 4 },
  { keyword: 'ordre de service', category: 'acceptation', weight: 5 },
  { keyword: 'notification de marché', category: 'acceptation', weight: 5 },
  { keyword: 'attributaire', category: 'acceptation', weight: 5 },
  { keyword: 'bon de commande', category: 'acceptation', weight: 4 },
]

export async function listAoKeywords(db: SupabaseClient): Promise<AoKeyword[]> {
  const { data, error } = await db
    .from('ao_keywords')
    .select('*')
    .order('category')
    .order('keyword')
  if (error) {
    console.error('[ao-keywords] list:', error.message)
    return []
  }
  return (data ?? []) as AoKeyword[]
}

export async function restoreDefaultAoKeywords(db: SupabaseClient): Promise<AoKeyword[]> {
  await db.from('ao_keywords').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const { error } = await db.from('ao_keywords').insert(DEFAULT_AO_KEYWORDS)
  if (error) throw new Error(error.message)
  return listAoKeywords(db)
}
