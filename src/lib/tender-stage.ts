import type { TenderStatus } from '@/types/database'

export type StatusTone = 'gray' | 'accent' | 'orange' | 'green' | 'red' | 'blue'

export const TONE_VARS: Record<StatusTone, { background: string; color: string }> = {
  gray: { background: 'var(--db-tag-bg)', color: 'var(--db-tag)' },
  accent: { background: 'var(--db-accent-bg)', color: 'var(--db-accent-text)' },
  orange: { background: 'var(--db-orange-bg)', color: 'var(--db-orange)' },
  green: { background: 'var(--db-green-bg)', color: 'var(--db-green-text)' },
  red: { background: 'var(--db-red-bg)', color: 'var(--db-red)' },
  blue: { background: 'var(--db-blue-bg)', color: 'var(--db-blue-text)' },
}

/** Dérive un libellé de statut « étape du dossier » à partir des données réelles (suivi visuel façon maquette). */
export function tenderStageDisplay(t: { status: TenderStatus; nb_suppliers: number; nb_quotes: number }): { label: string; tone: StatusTone } {
  if (t.status === 'gagne') return { label: 'Gagné', tone: 'green' }
  if (t.status === 'perdu') return { label: 'Perdu', tone: 'red' }
  if (t.status === 'cloture') return { label: 'Clôturé', tone: 'gray' }
  if (t.nb_suppliers === 0) return { label: 'À étudier', tone: 'gray' }
  if (t.nb_quotes > 0 && t.nb_quotes >= t.nb_suppliers) return { label: 'Remis', tone: 'blue' }
  if (t.nb_quotes > 0) return { label: 'Devis reçus', tone: 'orange' }
  return { label: 'En consultation', tone: 'accent' }
}
