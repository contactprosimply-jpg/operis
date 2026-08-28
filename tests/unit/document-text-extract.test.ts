import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredEmailAttachment } from '@/lib/mail-attachments'

// Contrôle ce que "pdf-parse" renvoie pour chaque test — évite d'avoir à fabriquer un
// vrai binaire PDF juste pour tester la logique de fiabilité.
let mockPdfText = ''
let mockPdfTables: string[][][] = []

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(() => ({
    getText: async () => ({
      text: mockPdfText,
      total: mockPdfText ? 1 : 0,
      getPageText: () => mockPdfText,
    }),
    getTable: async () => ({ mergedTables: mockPdfTables }),
  })),
}))

const { extractDocumentContent, extractPriceFromAttachments } = await import('@/lib/document-text-extract')

function att(overrides: Partial<StoredEmailAttachment> & { filename: string; data: string }): StoredEmailAttachment {
  return { contentType: 'application/pdf', ...overrides } as StoredEmailAttachment
}

const fakeDb = {} as SupabaseClient

beforeEach(() => {
  mockPdfText = ''
  mockPdfTables = []
})

describe('document-text-extract — fiabilité (ne jamais deviner un prix)', () => {
  it('.txt : toujours fiable', async () => {
    const buf = Buffer.from('Total HT 1500 EUR', 'utf8')
    const r = await extractDocumentContent('devis.txt', 'text/plain', buf)
    expect(r.reliable).toBe(true)
    expect(r.fullText).toContain('1500')
  })

  it('.doc legacy (binaire OLE) : jamais fiable', async () => {
    const buf = Buffer.from('peu importe le contenu binaire', 'utf8')
    const r = await extractDocumentContent('devis.doc', 'application/msword', buf)
    expect(r.reliable).toBe(false)
  })

  it('PDF avec une vraie couche texte : fiable', async () => {
    mockPdfText = 'Devis\nTotal HT 4500,00 €'
    const buf = Buffer.from('%PDF-1.4 fake')
    const r = await extractDocumentContent('devis.pdf', 'application/pdf', buf)
    expect(r.reliable).toBe(true)
  })

  it('PDF scanné (aucune couche texte, getText ET getTable vides) : jamais fiable', async () => {
    mockPdfText = ''
    mockPdfTables = []
    const buf = Buffer.from('%PDF-1.4 binaire compressé sans texte')
    const r = await extractDocumentContent('devis-scan.pdf', 'application/pdf', buf)
    expect(r.reliable).toBe(false)
  })

  it('PDF scanné : le texte de repli (décodage binaire) existe pour l\'aperçu mais est marqué non fiable', async () => {
    mockPdfText = ''
    const buf = Buffer.from('%PDF-1.4 binaire quelconque')
    const r = await extractDocumentContent('devis-scan.pdf', 'application/pdf', buf)
    expect(r.reliable).toBe(false)
    // Le texte de repli existe (pour un éventuel aperçu) mais ne doit jamais être
    // utilisé pour y chercher un prix — c'est extractPriceFromAttachments qui applique
    // cette règle en s'appuyant sur `reliable`.
  })
})

describe('extractPriceFromAttachments — ne jamais deviner un prix sur un scan', () => {
  it('PDF scanné : aucun prix renvoyé, scannedWithoutText=true', async () => {
    mockPdfText = ''
    const attachments = [att({ filename: 'devis-scan.pdf', data: Buffer.from('binaire').toString('base64') })]
    const result = await extractPriceFromAttachments(fakeDb, attachments)
    expect(result.price).toBeNull()
    expect(result.scannedWithoutText).toBe(true)
  })

  it('PDF avec texte réel : prix trouvé normalement, scannedWithoutText absent/false', async () => {
    mockPdfText = 'Devis n°42\nDésignation ... Montant\nTotal HT 4500,00 €'
    const attachments = [att({ filename: 'devis.pdf', data: Buffer.from('binaire').toString('base64') })]
    const result = await extractPriceFromAttachments(fakeDb, attachments)
    expect(result.price).toBe(4500)
    expect(result.scannedWithoutText).toBeFalsy()
  })

  it('devis.doc legacy sans prix identifiable : aucun prix deviné, pas de crash', async () => {
    const attachments = [att({ filename: 'devis.doc', contentType: 'application/msword', data: Buffer.from('contenu OLE quelconque').toString('base64') })]
    const result = await extractPriceFromAttachments(fakeDb, attachments)
    expect(result.price).toBeNull()
  })
})
