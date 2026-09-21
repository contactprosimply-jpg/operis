import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Route réelle + vrai assertTenderAccess : seuls l'auth, le contexte d'organisation et la base
// (en mémoire) sont simulés. Le client admin contourne le RLS en production, donc c'est ce
// contrôle applicatif — et lui seul — qui protège la route.

const T_OWNER_A = '11111111-1111-4111-8111-111111111111' // AO de l'organisation A
const T_OTHER = '22222222-2222-4222-8222-222222222222' // AO d'une autre organisation B
const Q_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' // devis de l'AO A
const Q_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' // devis de l'AO B
const S_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const USER_A = 'user-a'
const USER_B = 'user-b'
const USER_MEMBER_A = 'user-a-member'

type Row = Record<string, unknown>
const state = {
  caller: USER_A as string | null,
  tenders: [] as Row[],
  quotes: [] as Row[],
  contexts: {} as Record<string, { organizationId: string | null; isOwner: boolean; members: { user_id: string }[] }>,
}

// Mini-builder Supabase : from().select()/update().eq()…, terminé par single/maybeSingle ou await.
function fakeDb() {
  const from = (table: 'tenders' | 'quotes') => {
    const filters: [string, unknown][] = []
    let patch: Row | null = null
    const rows = () => (state[table] as Row[]).filter(r => filters.every(([k, v]) => r[k] === v))
    const run = () => {
      const found = rows()
      if (patch) found.forEach(r => Object.assign(r, patch))
      return found
    }
    const b: Record<string, unknown> = {
      select: () => b,
      update: (p: Row) => { patch = p; return b },
      eq: (k: string, v: unknown) => { filters.push([k, v]); return b },
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: run(), error: null }),
    }
    return b
  }
  return { from }
}

vi.mock('@/lib/auth', () => ({
  getUserFromRequest: async () => state.caller,
  unauthorized: () => Response.json({ success: false, error: 'Non autorisé' }, { status: 401 }),
}))
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => fakeDb() }))
vi.mock('@/lib/family', () => ({
  getFamilyContext: async (userId: string) => state.contexts[userId] ?? { organizationId: null, isOwner: false, members: [] },
}))
vi.mock('@/lib/priorities', () => ({ markEmailHandledQuietly: async () => {} }))

import { POST } from '@/app/api/tenders/[id]/validate-quote/route'

const call = (tenderId: string, body: Record<string, unknown>) =>
  POST(
    new NextRequest(`http://localhost/api/tenders/${tenderId}/validate-quote`, { method: 'POST', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: tenderId }) },
  )
const tender = (id: string) => state.tenders.find(t => t.id === id)!
const quote = (id: string) => state.quotes.find(q => q.id === id)!

beforeEach(() => {
  state.caller = USER_A
  state.tenders = [
    { id: T_OWNER_A, user_id: USER_A, assigned_to: null, status: 'en_cours' },
    { id: T_OTHER, user_id: USER_B, assigned_to: null, status: 'en_cours' },
  ]
  state.quotes = [
    { id: Q_A, tender_id: T_OWNER_A, supplier_id: S_A, is_selected: false, validated_by: null, received_at: '2026-09-01' },
    { id: Q_B, tender_id: T_OTHER, supplier_id: S_A, is_selected: false, validated_by: null, received_at: '2026-09-01' },
  ]
  state.contexts = {
    [USER_A]: { organizationId: 'org-a', isOwner: true, members: [{ user_id: USER_MEMBER_A }] },
    [USER_MEMBER_A]: { organizationId: 'org-a', isOwner: false, members: [] },
    [USER_B]: { organizationId: 'org-b', isOwner: true, members: [] },
  }
})

describe('POST /api/tenders/[id]/validate-quote — contrôle d\'accès', () => {
  it('401 sans authentification', async () => {
    state.caller = null
    expect((await call(T_OWNER_A, { quote_id: Q_A })).status).toBe(401)
  })

  it('une AUTRE organisation reçoit 403/404 et rien n\'est modifié (AO + devis d\'un autre)', async () => {
    state.caller = USER_A
    const res = await call(T_OTHER, { quote_id: Q_B })
    expect([403, 404]).toContain(res.status)
    expect(quote(Q_B).is_selected).toBe(false)
    expect(quote(Q_B).validated_by).toBeNull()
    expect(tender(T_OTHER).status).toBe('en_cours')
  })

  it('idem par winner_supplier_id (chemin sans quote_id)', async () => {
    const res = await call(T_OTHER, { winner_supplier_id: S_A })
    expect([403, 404]).toContain(res.status)
    expect(quote(Q_B).is_selected).toBe(false)
    expect(tender(T_OTHER).status).toBe('en_cours')
  })

  it('refuse de passer SON AO avec le devis d\'un autre AO (quote_id étranger)', async () => {
    const res = await call(T_OWNER_A, { quote_id: Q_B })
    expect(res.status).toBe(404)
    expect(quote(Q_B).is_selected).toBe(false)
    expect(tender(T_OWNER_A).status).toBe('en_cours') // pas passé « gagné » à moitié
  })

  it('un AO inexistant → 404', async () => {
    expect((await call('33333333-3333-4333-8333-333333333333', { quote_id: Q_A })).status).toBe(404)
  })

  it('refuse un identifiant mal formé (400)', async () => {
    expect((await call(T_OWNER_A, { quote_id: 'pas-un-uuid' })).status).toBe(400)
  })

  it('le propriétaire valide le devis de son AO : devis sélectionné, AO « gagné »', async () => {
    const res = await call(T_OWNER_A, { quote_id: Q_A })
    expect(res.status).toBe(200)
    expect(quote(Q_A).is_selected).toBe(true)
    expect(quote(Q_A).validated_by).toBe(USER_A)
    expect(tender(T_OWNER_A).status).toBe('gagne')
  })

  it('le créateur du groupe peut valider le devis d\'un AO de son équipe', async () => {
    tender(T_OWNER_A).user_id = USER_MEMBER_A
    expect((await call(T_OWNER_A, { winner_supplier_id: S_A })).status).toBe(200)
    expect(tender(T_OWNER_A).status).toBe('gagne')
  })

  it('un membre ne valide pas un AO du groupe qui ne lui est pas assigné', async () => {
    state.caller = USER_MEMBER_A
    const res = await call(T_OWNER_A, { quote_id: Q_A })
    expect([403, 404]).toContain(res.status)
    expect(quote(Q_A).is_selected).toBe(false)
  })
})
