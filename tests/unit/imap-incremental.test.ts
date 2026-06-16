import { describe, expect, it } from 'vitest'
import { incrementalUidSearchRange, filterUidsAboveLastSync } from '@/lib/imap-client'

describe('sync incrémental IMAP (last_sync_uid)', () => {
  it('génère la plage UID IMAP minUid+1:*', () => {
    expect(incrementalUidSearchRange(100)).toBe('101:*')
    expect(incrementalUidSearchRange(0)).toBe('1:*')
  })

  it('ne retourne que les UID > last_sync_uid', () => {
    const all = [42, 100, 101, 150, 200]
    expect(filterUidsAboveLastSync(100, all)).toEqual([101, 150, 200])
  })

  it('retourne tous les UID si last_sync_uid est 0', () => {
    const all = [10, 20, 30]
    expect(filterUidsAboveLastSync(0, all)).toEqual([10, 20, 30])
  })

  it('retourne vide si aucun UID nouveau', () => {
    expect(filterUidsAboveLastSync(500, [100, 200, 500])).toEqual([])
  })
})
