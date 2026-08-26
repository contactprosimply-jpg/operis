import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredEmailAttachment } from '@/lib/mail-attachments'

const checkStorageQuota = vi.fn()

vi.mock('@/lib/billing/subscription', () => ({
  checkStorageQuota: (...args: unknown[]) => checkStorageQuota(...args),
}))

const { persistAttachmentsToStorage } = await import('@/lib/mail-storage')

function createStorageMock() {
  const uploads: Array<{ path: string; bytes: number }> = []
  const db = {
    storage: {
      from: () => ({
        upload: async (path: string, buffer: Buffer) => {
          uploads.push({ path, bytes: buffer.length })
          return { error: null }
        },
      }),
    },
  } as unknown as SupabaseClient
  return { db, uploads }
}

function att(overrides: Partial<StoredEmailAttachment> & { size: number }): StoredEmailAttachment {
  return {
    filename: 'fichier.pdf',
    contentType: 'application/pdf',
    data: Buffer.alloc(overrides.size).toString('base64'),
    ...overrides,
  }
}

beforeEach(() => {
  checkStorageQuota.mockReset()
})

describe('persistAttachmentsToStorage — quota', () => {
  it('stocke normalement sous quota', async () => {
    checkStorageQuota.mockResolvedValue({ exceeds: false, ctx: { storageBytes: 0 }, limitBytes: 1000 })
    const { db, uploads } = createStorageMock()

    const result = await persistAttachmentsToStorage(db, 'user-1', 'email-1', [att({ size: 100 })])

    expect(uploads).toHaveLength(1)
    expect(result[0].path).toBeTruthy()
    expect(result[0].quotaExceeded).toBeFalsy()
  })

  it("ne stocke pas dans Storage et ne bascule pas sur le fallback base64 si le quota est dépassé", async () => {
    checkStorageQuota.mockResolvedValue({ exceeds: true, ctx: { storageBytes: 950 }, limitBytes: 1000 })
    const { db, uploads } = createStorageMock()

    // 100 octets, petit fichier qui passerait normalement par le fallback base64 (<=500 Ko)
    const result = await persistAttachmentsToStorage(db, 'user-1', 'email-1', [att({ size: 100 })])

    expect(uploads).toHaveLength(0)
    expect(result[0].quotaExceeded).toBe(true)
    expect(result[0].data).toBeUndefined()
    expect(result[0].path).toBeUndefined()
    expect(result[0].size).toBe(100) // métadonnées conservées pour l'affichage / le suivi du quota
  })

  it('un batch multi-pièces-jointes bascule dès que le total cumulé dépasse le quota', async () => {
    checkStorageQuota.mockResolvedValue({ exceeds: false, ctx: { storageBytes: 0 }, limitBytes: 150 })
    const { db, uploads } = createStorageMock()

    const result = await persistAttachmentsToStorage(db, 'user-1', 'email-1', [
      att({ size: 100, filename: 'a.pdf' }),
      att({ size: 100, filename: 'b.pdf' }),
    ])

    expect(uploads).toHaveLength(1) // seule la première rentre sous les 150 octets de quota
    expect(result[0].quotaExceeded).toBeFalsy()
    expect(result[1].quotaExceeded).toBe(true)
  })

  it('ne bloque jamais la synchro si le calcul de quota échoue (fail-open)', async () => {
    checkStorageQuota.mockRejectedValue(new Error('billing context unavailable'))
    const { db, uploads } = createStorageMock()

    const result = await persistAttachmentsToStorage(db, 'user-1', 'email-1', [att({ size: 100 })])

    expect(uploads).toHaveLength(1)
    expect(result[0].quotaExceeded).toBeFalsy()
  })
})
