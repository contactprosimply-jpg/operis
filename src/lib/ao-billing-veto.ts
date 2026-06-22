/** Veto comptable — court-circuit avant scoring AO. */

const FACTURE_SUBJECT_VETO = [
  'facture',
  'facturation',
  'avoir n',
  'avoir °',
  'note de frais',
  'quittance',
]

const BILLING_BODY_VETO = [
  'votre facture',
  'facture jointe',
  'facture ci-jointe',
  'facture n',
  'montant à régler',
  'montant a regler',
  'reste à payer',
  'reste a payer',
  'à régler avant',
  'a regler avant',
  'à payer avant',
  'a payer avant',
  'relance de paiement',
  'rappel de paiement',
  'retard de paiement',
  'paiement en attente',
  'défaut de paiement',
  'defaut de paiement',
  'régularisation de votre compte',
  'regularisation de votre compte',
  'iban',
  'rib',
  'coordonnées bancaires',
  'coordonnees bancaires',
  'prélèvement automatique',
  'prelevement automatique',
  'relevé de compte',
  'releve de compte',
  'reçu de paiement',
  'recu de paiement',
  'échéance de paiement',
  'echeance de paiement',
]

export type BillingVetoReason = 'facture_sujet' | 'signal_facturation'

export function billingVeto(subject: string, bodyText: string): BillingVetoReason | null {
  const s = (subject ?? '').toLowerCase()
  const b = `${subject ?? ''} ${bodyText ?? ''}`.toLowerCase()
  if (FACTURE_SUBJECT_VETO.some(t => s.includes(t))) {
    return 'facture_sujet'
  }
  if (BILLING_BODY_VETO.some(t => b.includes(t))) {
    return 'signal_facturation'
  }
  return null
}
