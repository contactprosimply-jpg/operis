/**
 * « Devis à rattacher » : un mail reçu, non lié à un AO, qui n'est pas lui-même un appel d'offres
 * et qui ressemble à un devis (pièce jointe ou sujet évoquant un devis). La règle vivait dans le
 * navigateur (dashboard) sur les 150 derniers mails ; elle est ici côté serveur, partagée par le
 * compteur du dashboard et le filtre « Devis » de la messagerie pour que les deux concordent.
 */

/** Au-delà, un mail non rattaché n'est plus une action du jour mais de l'historique de boîte. */
export const QUOTE_LOOKBACK_DAYS = 45

export const QUOTE_SUBJECT_TERMS = ['devis', 'ponuda', 'chiffrage', 'offre', 'proposition'] as const

/** Filtre PostgREST `or` : pièce jointe OU sujet évoquant un devis. */
export const QUOTE_OR_FILTER = [
  'has_attachments.eq.true',
  ...QUOTE_SUBJECT_TERMS.map(term => `subject.ilike.%${term}%`),
].join(',')

export function quoteLookbackSince(now = Date.now()): string {
  return new Date(now - QUOTE_LOOKBACK_DAYS * 86400000).toISOString()
}
