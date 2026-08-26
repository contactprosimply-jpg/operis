import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { buildPaymentFailedEmail } from '@/lib/billing/payment-failed-email'

function invoice(overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice {
  return {
    amount_due: 5000,
    currency: 'eur',
    hosted_invoice_url: 'https://invoice.stripe.com/i/abc123',
    next_payment_attempt: null,
    ...overrides,
  } as Stripe.Invoice
}

describe('buildPaymentFailedEmail', () => {
  it('formate le montant en euros', () => {
    const { html } = buildPaymentFailedEmail(invoice({ amount_due: 5000, currency: 'eur' }))
    expect(html).toContain('50.00 €')
  })

  it('inclut la date de prochaine tentative quand connue', () => {
    const nextAttempt = Math.floor(new Date('2026-09-15T10:00:00Z').getTime() / 1000)
    const { html } = buildPaymentFailedEmail(invoice({ next_payment_attempt: nextAttempt }))
    expect(html).toContain('15 septembre 2026')
    expect(html).not.toContain('Aucune nouvelle tentative')
  })

  it("indique l'absence de nouvelle tentative planifiee sinon", () => {
    const { html } = buildPaymentFailedEmail(invoice({ next_payment_attempt: null }))
    expect(html).toContain('Aucune nouvelle tentative')
  })

  it("inclut le lien vers la facture hebergee Stripe quand present", () => {
    const { html } = buildPaymentFailedEmail(invoice({ hosted_invoice_url: 'https://invoice.stripe.com/i/xyz' }))
    expect(html).toContain('https://invoice.stripe.com/i/xyz')
  })

  it("ne plante pas et n'affiche pas de lien si hosted_invoice_url est absent", () => {
    const { html } = buildPaymentFailedEmail(invoice({ hosted_invoice_url: null }))
    expect(html).not.toContain('href="null"')
  })

  it('a un sujet fixe et explicite', () => {
    const { subject } = buildPaymentFailedEmail(invoice())
    expect(subject).toBe('Operis — échec de votre paiement')
  })
})
