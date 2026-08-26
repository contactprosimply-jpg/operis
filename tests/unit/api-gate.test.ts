import { describe, expect, it } from 'vitest'
import { isBillingGateExempt } from '@/lib/billing/api-gate'

describe('isBillingGateExempt — exemption totale (auth, billing, technique)', () => {
  it.each([
    ['/api/auth/signup', 'POST'],
    ['/api/auth/change-password', 'POST'],
    ['/api/billing/checkout', 'GET'],
    ['/api/billing/confirm-session', 'GET'],
    ['/api/billing/portal', 'GET'],
    ['/api/billing/status', 'GET'],
    ['/api/billing/storage-addon', 'POST'],
    ['/api/billing/webhook', 'POST'],
    ['/api/account', 'GET'],
    ['/api/profile', 'GET'],
    ['/api/profile', 'PATCH'],
    ['/api/build-info', 'GET'],
    ['/api/desktop/update/latest.yml', 'GET'],
    ['/api/cron/sync-mail', 'GET'],
    ['/api/cron/relaunch', 'GET'],
    ['/api/public/verify-mail/abc123', 'GET'],
  ])('%s %s est exempté quelle que soit la méthode', (path, method) => {
    expect(isBillingGateExempt(path, method)).toBe(true)
  })
})

describe('isBillingGateExempt — protection forcée (produit, pas donnée du client)', () => {
  it('GET /api/desktop/download reste protégé malgré la méthode GET', () => {
    expect(isBillingGateExempt('/api/desktop/download', 'GET')).toBe(false)
  })
})

describe('isBillingGateExempt — mail : lecture libre, écriture protégée', () => {
  it.each([
    '/api/mail/emails',
    '/api/mail/emails/abc',
    '/api/mail/folders',
    '/api/mail/unread-count',
    '/api/mail/sent',
    '/api/mail/delta',
    '/api/mail/sync/status',
  ])('GET %s est exempté (lecture des propres mails)', (path) => {
    expect(isBillingGateExempt(path, 'GET')).toBe(true)
  })

  it.each([
    ['/api/mail/send', 'POST'],
    ['/api/mail/sync', 'POST'],
    ['/api/mail/actions', 'POST'],
    ['/api/mail/emails/abc', 'PATCH'],
    ['/api/mail/accounts', 'POST'],
  ])('%s %s est protégé (envoi / synchro / action)', (path, method) => {
    expect(isBillingGateExempt(path, method)).toBe(false)
  })
})

describe('isBillingGateExempt — AO / contacts : lecture (export RGPD) libre, écriture protégée', () => {
  it.each([
    '/api/tenders',
    '/api/tenders/abc',
    '/api/tenders/abc/suppliers',
    '/api/tenders/abc/documents',
    '/api/tenders/abc/documents/doc1/url',
    '/api/contacts',
    '/api/suppliers',
    '/api/quotes',
  ])('GET %s est exempté (récupération des propres données)', (path) => {
    expect(isBillingGateExempt(path, 'GET')).toBe(true)
  })

  it.each([
    ['/api/tenders', 'POST'],
    ['/api/tenders', 'DELETE'],
    ['/api/tenders/abc', 'PATCH'],
    ['/api/tenders/abc/consult', 'POST'],
    ['/api/tenders/abc/relaunch', 'POST'],
    ['/api/tenders/abc/analyze-quotes', 'POST'],
    ['/api/tenders/abc/documents', 'POST'],
  ])('%s %s est protégé', (path, method) => {
    expect(isBillingGateExempt(path, method)).toBe(false)
  })
})

describe('isBillingGateExempt — nouvelle route hypothétique : protégée par défaut en écriture', () => {
  it('POST sur une route jamais listée est protégé par défaut', () => {
    expect(isBillingGateExempt('/api/une-route-du-futur', 'POST')).toBe(false)
  })

  it('GET sur une route jamais listée reste lisible par défaut (lecture seule = sûr)', () => {
    expect(isBillingGateExempt('/api/une-route-du-futur', 'GET')).toBe(true)
  })
})
