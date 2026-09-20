import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PriorityItem, PriorityPayload } from '@/lib/priorities-rules'
import { buildPayload } from '@/lib/priorities-rules'

const sendHtmlEmail = vi.fn(async (_: { to: string; subject: string; html: string }) => {})
const markDigestSent = vi.fn(async () => {})
const collectPriorityItems = vi.fn<() => Promise<PriorityPayload>>()
const getNotificationSettings = vi.fn()
const requireBillingAccess = vi.fn()
const listAllAuthUsers = vi.fn()

vi.mock('@/lib/mailer', () => ({ sendHtmlEmail: (a: { to: string; subject: string; html: string }) => sendHtmlEmail(a), isEmailConfigured: () => true }))
vi.mock('@/lib/notification-settings', () => ({
  getNotificationSettings: (...a: unknown[]) => getNotificationSettings(...a),
  markDigestSent: (...a: unknown[]) => markDigestSent(...(a as [])),
}))
vi.mock('@/lib/priorities', () => ({ collectPriorityItems: () => collectPriorityItems() }))
vi.mock('@/lib/billing/subscription', () => ({ requireBillingAccess: (...a: unknown[]) => requireBillingAccess(...a) }))
vi.mock('@/lib/auth-users', () => ({ listAllAuthUsers: () => listAllAuthUsers() }))
vi.mock('@/lib/tender-access', () => ({ getTenderAccessScope: async () => ({ isOrgOwner: false, organizationId: null, teamUserIds: [] }) }))
vi.mock('@/lib/site-url', () => ({ sitePath: (p: string) => `https://operis.test${p}` }))

const { buildDigestEmail, esc, sendUserDigests } = await import('@/lib/digest')

function item(over: Partial<PriorityItem>): PriorityItem {
  return {
    emailId: 'e1', kind: 'question', subject: 'Sujet', fromName: 'Jean', fromAddress: 'j@x.fr', receivedAt: '2026-09-18T08:00:00Z',
    ageDays: 3, tenderId: 't1', tenderTitle: 'École', supplierName: 'Alu', snippet: 'Pouvez-vous confirmer ?', price: null, isBestPrice: false, ...over,
  }
}

/** Faux client Supabase : tenders (échéances) et notifications (rappel du jour). */
function fakeDb(opts: { tenders?: unknown[]; existingRecap?: boolean } = {}) {
  const inserted: Record<string, unknown>[] = []
  const chain = (result: unknown): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'in', 'not', 'eq', 'or', 'gte', 'limit']) c[m] = () => c
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return c
  }
  return {
    inserted,
    db: {
      from: (table: string) => {
        if (table === 'tenders') return chain({ data: opts.tenders ?? [] })
        if (table === 'notifications') return { ...chain({ data: opts.existingRecap ? [{ id: 'n' }] : [] }), insert: async (row: Record<string, unknown>) => { inserted.push(row); return {} } }
        return chain({ data: [] })
      },
    } as never,
  }
}

const TUESDAY_8H = new Date('2026-09-22T06:30:00Z') // 08:30 à Paris
const settings = { digest_enabled: true, digest_hour: 8, digest_last_sent_on: null as string | null }

beforeEach(() => {
  vi.clearAllMocks()
  listAllAuthUsers.mockResolvedValue([{ id: 'u1', email: 'marie@exemple.fr' }])
  getNotificationSettings.mockResolvedValue({ ...settings })
  requireBillingAccess.mockResolvedValue({ ok: true })
  collectPriorityItems.mockResolvedValue(buildPayload([item({})]))
})

describe('esc / buildDigestEmail', () => {
  it('échappe le HTML venant de mails externes', () => {
    expect(esc('<script>alert("x")</script> & \'y\'')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;')
  })
  it('ne laisse passer aucune balise venant du sujet, du nom ou de l’extrait', () => {
    const payload = buildPayload([item({ subject: '<img src=x onerror=alert(1)>', fromName: '<b>Pirate</b>', supplierName: null, snippet: '<script>x()</script>', tenderTitle: 'AO <i>x</i>' })])
    const { html } = buildDigestEmail(payload, [])
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>x()')
    expect(html).not.toContain('<b>Pirate</b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
  it('résume les éléments à traiter et les échéances dans l’objet', () => {
    const payload = buildPayload([item({ kind: 'quote', price: 231400, isBestPrice: true }), item({ emailId: 'e2' })])
    const { subject, html } = buildDigestEmail(payload, [{ id: 't', title: 'AO', client: 'C', daysLeft: 1 }])
    expect(subject).toBe('[Operis] 2 éléments à traiter · 1 échéance proche')
    expect(html).toContain('231')
    expect(html).toContain('meilleur prix')
    expect(html).toContain('https://operis.test/mail?email=e1')
    expect(html).toContain('/settings?tab=notifications')
  })
})

describe('sendUserDigests', () => {
  it('envoie le récap à l’heure choisie, le marque envoyé et crée un seul rappel dans la cloche', async () => {
    const { db, inserted } = fakeDb()
    const stats = await sendUserDigests(db, TUESDAY_8H)
    expect(stats).toEqual({ users: 1, sent: 1, failed: 0 })
    expect(sendHtmlEmail).toHaveBeenCalledTimes(1)
    expect(sendHtmlEmail.mock.calls[0][0].to).toBe('marie@exemple.fr')
    expect(markDigestSent).toHaveBeenCalledTimes(1)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ type: 'todo_recap', user_id: 'u1', priority: 'important' })
  })

  it('ne crée pas un 2e rappel dans la cloche le même jour', async () => {
    const { db, inserted } = fakeDb({ existingRecap: true })
    await sendUserDigests(db, TUESDAY_8H)
    expect(inserted).toHaveLength(0)
  })

  it('n’envoie rien s’il n’y a rien à traiter (et ne marque pas la journée)', async () => {
    collectPriorityItems.mockResolvedValue(buildPayload([]))
    const { db } = fakeDb()
    const stats = await sendUserDigests(db, TUESDAY_8H)
    expect(stats.sent).toBe(0)
    expect(sendHtmlEmail).not.toHaveBeenCalled()
    expect(markDigestSent).not.toHaveBeenCalled()
  })

  it('respecte le réglage : désactivé, mauvaise heure, déjà envoyé aujourd’hui', async () => {
    for (const s of [
      { ...settings, digest_enabled: false },
      { ...settings, digest_hour: 11 },
      { ...settings, digest_last_sent_on: '2026-09-22' },
    ]) {
      getNotificationSettings.mockResolvedValue(s)
      const { db } = fakeDb()
      expect((await sendUserDigests(db, TUESDAY_8H)).sent).toBe(0)
    }
    expect(sendHtmlEmail).not.toHaveBeenCalled()
  })

  it('n’envoie pas le week-end', async () => {
    const { db } = fakeDb()
    const stats = await sendUserDigests(db, new Date('2026-09-26T06:30:00Z'))
    expect(stats.sent).toBe(0)
    expect(sendHtmlEmail).not.toHaveBeenCalled()
  })

  it('ignore les comptes sans accès payant', async () => {
    requireBillingAccess.mockResolvedValue({ ok: false })
    const { db } = fakeDb()
    expect((await sendUserDigests(db, TUESDAY_8H)).sent).toBe(0)
    expect(sendHtmlEmail).not.toHaveBeenCalled()
  })

  it('un échec d’envoi chez un utilisateur n’empêche pas les autres', async () => {
    listAllAuthUsers.mockResolvedValue([{ id: 'u1', email: 'a@x.fr' }, { id: 'u2', email: 'b@x.fr' }])
    sendHtmlEmail.mockRejectedValueOnce(new Error('Resend down'))
    const { db } = fakeDb()
    const stats = await sendUserDigests(db, TUESDAY_8H)
    expect(stats).toEqual({ users: 2, sent: 1, failed: 1 })
    expect(markDigestSent).toHaveBeenCalledTimes(1) // seul le succès est marqué : l'échec sera retenté
  })

  it('inclut les échéances proches des AO dont on est destinataire', async () => {
    collectPriorityItems.mockResolvedValue(buildPayload([]))
    const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
    const { db } = fakeDb({ tenders: [
      { id: 't1', title: 'Gymnase', client: 'Mairie', deadline: soon, user_id: 'u1', assigned_to: null },
      { id: 't2', title: 'Pas à moi', client: 'X', deadline: soon, user_id: 'autre', assigned_to: null },
    ] })
    const stats = await sendUserDigests(db, TUESDAY_8H)
    expect(stats.sent).toBe(1)
    const html = sendHtmlEmail.mock.calls[0][0].html
    expect(html).toContain('Gymnase')
    expect(html).not.toContain('Pas à moi')
  })
})
