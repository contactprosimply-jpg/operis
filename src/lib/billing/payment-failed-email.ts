import type Stripe from 'stripe'

function formatAmount(amountDue: number | null | undefined, currency: string | null | undefined): string {
  if (amountDue == null) return 'montant inconnu'
  const value = (amountDue / 100).toFixed(2)
  const code = (currency ?? '').toUpperCase()
  if (code === 'EUR') return `${value} €`
  if (code === 'USD') return `${value} $`
  return code ? `${value} ${code}` : value
}

function formatNextAttempt(nextPaymentAttempt: number | null | undefined): string | null {
  if (!nextPaymentAttempt) return null
  return new Date(nextPaymentAttempt * 1000).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

/** Contenu de l'email envoyé au client sur `invoice.payment_failed` — pur, testable
 *  sans Stripe ni SMTP. Le lien pointe vers `hosted_invoice_url` (page Stripe hébergée où
 *  le client peut voir la facture et mettre à jour son moyen de paiement), pas besoin de
 *  générer nous-même une session de portail pour un email transactionnel. */
export function buildPaymentFailedEmail(invoice: Stripe.Invoice): { subject: string; html: string } {
  const amount = formatAmount(invoice.amount_due, invoice.currency)
  const nextAttempt = formatNextAttempt(invoice.next_payment_attempt)
  const payUrl = invoice.hosted_invoice_url

  const subject = 'Operis — échec de votre paiement'

  const html = `
    <div style="font-family:DM Sans,sans-serif;color:#021246">
      <h2 style="color:#021246">Le paiement de votre abonnement Operis a échoué</h2>
      <p>Le prélèvement de <strong>${amount}</strong> pour votre abonnement Operis n'a pas abouti.</p>
      ${nextAttempt
        ? `<p>Une nouvelle tentative aura lieu automatiquement le <strong>${nextAttempt}</strong>.</p>`
        : `<p>Aucune nouvelle tentative n'est actuellement planifiée — merci de régulariser dès que possible.</p>`}
      ${payUrl
        ? `<p><a href="${payUrl}" style="display:inline-block;background:#3b7ef6;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Mettre à jour mon moyen de paiement</a></p>`
        : ''}
      <p style="font-size:12px;color:#64748b">Si vous pensez qu'il s'agit d'une erreur, contactez-nous à operiscontact@gmail.com.</p>
    </div>
  `

  return { subject, html }
}
