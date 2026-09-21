import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// POST /api/quotes : le client admin contourne le RLS, donc l'appartenance de l'AO ET du
// fournisseur ne dépend que de ces contrôles applicatifs. Route réelle, base en mémoire.

const T_A = '11111111-1111-4111-8111-111111111111' // AO de l'utilisateur A
const T_B = '22222222-2222-4222-8222-222222222222' // AO d'une autre organisation
const S_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' // fournisseur de A
const S_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' // fournisseur d'une autre organisation
const USER_A = 'user-a'
const USER_B = 'user-b'

type Row = Record<string, unknown>
type Table = 'tenders' | 'suppliers' | 'quotes' | 'consultation_suppliers'
const state = {
  caller: USER_A as string | null,
  tenders: [] as Row[],
  suppliers: [] as Row[],
  quotes: [] as Row[],
  consultation_suppliers: [] as Row[],
}

function fakeDb() {
  const from = (table: Table) => {
    const filters: [string, unknown][] = []
    let patch: Row | null = null
    let inserted: Row | null = null
    const rows = () => (state[table] as Row[]).filter(r => filters.every(([k, v]) => r[k] === v))
    const run = () => {
      if (inserted) { state[table].push(inserted); return [inserted] }
      const found = rows()
      if (patch) found.forEach(r => Object.assign(r, patch))
      return found
    }
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (row: Row) => { inserted = { id: `new-${state[table].length}`, ...row }; return b },
      update: (p: Row) => { patch = p; return b },
      eq: (k: string, v: unknown) => { filters.push([k, v]); return b },
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
  getFamilyContext: async () => ({ organizationId: null, isOwner: false, members: [] }),
}))

import { POST } from '@/app/api/quotes/route'

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/quotes', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  state.caller = USER_A
  state.tenders = [{ id: T_A, user_id: USER_A }, { id: T_B, user_id: USER_B }]
  state.suppliers = [{ id: S_A, user_id: USER_A }, { id: S_B, user_id: USER_B }]
  state.quotes = []
  state.consultation_suppliers = [
    { tender_id: T_A, supplier_id: S_A, status: 'envoye' },
    { tender_id: T_A, supplier_id: S_B, status: 'envoye' },
  ]
})

describe('POST /api/quotes — appartenance de l\'AO et du fournisseur', () => {
  it('enregistre le devis d\'un fournisseur de l\'appelant sur son AO', async () => {
    const res = await post({ tender_id: T_A, supplier_id: S_A, price_ht: 1200 })
    expect(res.status).toBe(201)
    expect(state.quotes).toHaveLength(1)
    expect(state.consultation_suppliers.find(c => c.supplier_id === S_A)?.status).toBe('repondu')
  })

  it('refuse le fournisseur d\'une AUTRE organisation (404) : aucun devis, aucune consultation touchée', async () => {
    const res = await post({ tender_id: T_A, supplier_id: S_B, price_ht: 1200 })
    expect(res.status).toBe(404)
    expect(state.quotes).toHaveLength(0)
    expect(state.consultation_suppliers.find(c => c.supplier_id === S_B)?.status).toBe('envoye')
  })

  it('refuse un fournisseur inexistant (404)', async () => {
    const res = await post({ tender_id: T_A, supplier_id: '33333333-3333-4333-8333-333333333333' })
    expect(res.status).toBe(404)
    expect(state.quotes).toHaveLength(0)
  })

  it('refuse l\'AO d\'un autre (404), même avec son propre fournisseur', async () => {
    const res = await post({ tender_id: T_B, supplier_id: S_A })
    expect(res.status).toBe(404)
    expect(state.quotes).toHaveLength(0)
  })

  it('401 sans authentification', async () => {
    state.caller = null
    expect((await post({ tender_id: T_A, supplier_id: S_A })).status).toBe(401)
  })
})
