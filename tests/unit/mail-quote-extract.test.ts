import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredEmailAttachment } from '@/lib/mail-attachments'

const extractPriceFromAttachments = vi.fn()

vi.mock('@/lib/document-text-extract', () => ({
  extractPriceFromAttachments: (...args: unknown[]) => extractPriceFromAttachments(...args),
}))

const { upsertQuoteFromEmail } = await import('@/lib/mail-quote-extract')

/** Mock minimal d'un query builder Supabase chaînable, assez pour upsertQuoteFromEmail. */
function fakeDb(existingQuote: { id: string; price_ht: number | null } | null) {
  const inserted: Record<string, unknown>[] = []
  const updated: Array<{ id: string; patch: Record<string, unknown> }> = []

  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: existingQuote }),
    insert: (row: Record<string, unknown>) => {
      inserted.push(row)
      return {
        select: () => ({
          single: async () => ({ data: { id: 'new-quote-id', price_ht: row.price_ht }, error: null }),
        }),
      }
    },
    update: (patch: Record<string, unknown>) => {
      updated.push({ id: existingQuote?.id ?? '', patch })
      return { eq: async () => ({ error: null }) }
    },
  }

  const db = { from: () => builder } as unknown as SupabaseClient
  return { db, inserted, updated }
}

const pdfAttachment: StoredEmailAttachment = {
  filename: 'devis.pdf',
  contentType: 'application/pdf',
  data: Buffer.from('x').toString('base64'),
} as StoredEmailAttachment

beforeEach(() => {
  extractPriceFromAttachments.mockReset()
})

describe('upsertQuoteFromEmail — jamais de prix devine, message clair sur un scan', () => {
  it('PDF scanné (scannedWithoutText) : notes invite explicitement à la saisie manuelle, prix null', async () => {
    extractPriceFromAttachments.mockResolvedValue({
      price: null, combinedText: '', scannedWithoutText: true,
    })
    const { db, inserted } = fakeDb(null)

    const quote = await upsertQuoteFromEmail(db, 'tender-1', 'supplier-1', 'email-1', '', [pdfAttachment])

    expect(quote).not.toBeNull()
    expect(inserted).toHaveLength(1)
    expect(inserted[0].price_ht).toBeNull()
    expect(inserted[0].notes).toContain('scanné')
    expect(inserted[0].notes).toContain('manuellement')
  })

  it('PDF lisible avec prix : notes normales, pas de mention de scan', async () => {
    extractPriceFromAttachments.mockResolvedValue({
      price: 4500, combinedText: '', priceNote: 'Prix final (Total HT)', sourceFile: 'devis.pdf',
    })
    const { db, inserted } = fakeDb(null)

    const quote = await upsertQuoteFromEmail(db, 'tender-1', 'supplier-1', 'email-1', '', [pdfAttachment])

    expect(quote?.price_ht).toBe(4500)
    expect(inserted[0].price_ht).toBe(4500)
    expect(inserted[0].notes).not.toContain('scanné')
  })

  it('ni prix ni PJ devis : ne crée pas de devis (pas de fausse entrée)', async () => {
    extractPriceFromAttachments.mockResolvedValue({ price: null, combinedText: '' })
    const { db, inserted } = fakeDb(null)

    const quote = await upsertQuoteFromEmail(db, 'tender-1', 'supplier-1', 'email-1', 'bonjour', [])

    expect(quote).toBeNull()
    expect(inserted).toHaveLength(0)
  })
})
