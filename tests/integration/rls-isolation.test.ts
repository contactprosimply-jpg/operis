import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTestClients, integrationConfigured } from '../helpers/supabase-test'

const runIntegration = integrationConfigured()

describe.skipIf(!runIntegration)('RLS isolation (orgs A / B)', () => {
  let userAId: string
  let clientA: SupabaseClient
  let clientB: SupabaseClient
  let admin: SupabaseClient

  let tenderAId: string
  let emailAId: string
  let docAId: string
  let quoteAId: string
  let supplierAId: string

  let tenderBId: string

  beforeAll(async () => {
    const clients = await createTestClients()
    userAId = clients.userA.id
    clientA = clients.userA.client
    clientB = clients.userB.client
    admin = clients.admin

    // Données A (service role pour quotes — besoin supplier)
    const { data: tenderA, error: tErr } = await admin
      .from('tenders')
      .insert({
        user_id: userAId,
        title: `[TEST] AO isolation A ${Date.now()}`,
        client: 'Client Test A',
        status: 'nouveau',
      })
      .select('id')
      .single()
    if (tErr) throw tErr
    tenderAId = tenderA.id

    const { data: emailA, error: eErr } = await admin
      .from('emails')
      .insert({
        user_id: userAId,
        subject: '[TEST] Mail A',
        from_address: 'a@test.local',
        to_address: 'me@test.local',
        tender_id: tenderAId,
      })
      .select('id')
      .single()
    if (eErr) throw eErr
    emailAId = emailA.id

    const { data: docA, error: dErr } = await admin
      .from('tender_documents')
      .insert({
        tender_id: tenderAId,
        user_id: userAId,
        filename: 'test-a.pdf',
        storage_path: `${userAId}/${tenderAId}/test-a.pdf`,
        bucket: 'devis',
        source: 'upload',
      })
      .select('id')
      .single()
    if (dErr) throw dErr
    docAId = docA.id

    const { data: supA, error: sErr } = await admin
      .from('suppliers')
      .insert({
        user_id: userAId,
        name: 'Fournisseur Test A',
        email: `supplier-a-${Date.now()}@test.local`,
      })
      .select('id')
      .single()
    if (sErr) throw sErr
    supplierAId = supA.id

    const { data: quoteA, error: qErr } = await admin
      .from('quotes')
      .insert({
        tender_id: tenderAId,
        supplier_id: supplierAId,
        price_ht: 1000,
      })
      .select('id')
      .single()
    if (qErr) throw qErr
    quoteAId = quoteA.id

    // Tender B minimal pour test inverse
    const { data: tenderB, error: tbErr } = await admin
      .from('tenders')
      .insert({
        user_id: clients.userB.id,
        title: `[TEST] AO isolation B ${Date.now()}`,
        client: 'Client Test B',
        status: 'nouveau',
      })
      .select('id')
      .single()
    if (tbErr) throw tbErr
    tenderBId = tenderB.id
  }, 60000)

  afterAll(async () => {
    if (!admin || !tenderAId) return
    await admin.from('tenders').delete().eq('id', tenderAId)
    await admin.from('tenders').delete().eq('id', tenderBId)
    await admin.from('suppliers').delete().eq('id', supplierAId)
  }, 60000)

  it('user A peut lire ses propres données', async () => {
    const { data: tenders } = await clientA.from('tenders').select('id').eq('id', tenderAId)
    expect(tenders?.length).toBe(1)

    const { data: emails } = await clientA.from('emails').select('id').eq('id', emailAId)
    expect(emails?.length).toBe(1)

    const { data: docs } = await clientA.from('tender_documents').select('id').eq('id', docAId)
    expect(docs?.length).toBe(1)

    const { data: quotes } = await clientA.from('quotes').select('id').eq('id', quoteAId)
    expect(quotes?.length).toBe(1)
  })

  it('user B ne peut pas lire tenders / emails / documents / quotes de A', async () => {
    const { data: tenders } = await clientB.from('tenders').select('id').eq('id', tenderAId)
    expect(tenders ?? []).toHaveLength(0)

    const { data: emails } = await clientB.from('emails').select('id').eq('id', emailAId)
    expect(emails ?? []).toHaveLength(0)

    const { data: docs } = await clientB.from('tender_documents').select('id').eq('id', docAId)
    expect(docs ?? []).toHaveLength(0)

    const { data: quotes } = await clientB.from('quotes').select('id').eq('id', quoteAId)
    expect(quotes ?? []).toHaveLength(0)
  })

  it('user A ne peut pas lire le tender de B', async () => {
    const { data: tenders } = await clientA.from('tenders').select('id').eq('id', tenderBId)
    expect(tenders ?? []).toHaveLength(0)
  })
})
