import { describe, it, expect } from 'vitest'
import { lookbackSinceDate } from '@/lib/mail-sync-lookback'
import { DEFAULT_USER_SETTINGS } from '@/lib/user-settings'

describe('limite de synchro IMAP', () => {
  it('12 mois par défaut', () => {
    expect(DEFAULT_USER_SETTINGS.mail_sync_lookback_months).toBe(12)
  })
  it('borne = date du jour moins N mois', () => {
    const since = lookbackSinceDate(12, new Date('2026-09-23T10:00:00Z'))
    expect(since?.toISOString().slice(0, 10)).toBe('2025-09-23')
  })
  it('0, vide ou négatif = pas de borne (tout l’historique)', () => {
    expect(lookbackSinceDate(0)).toBeNull()
    expect(lookbackSinceDate(null)).toBeNull()
    expect(lookbackSinceDate(-3)).toBeNull()
  })
})
