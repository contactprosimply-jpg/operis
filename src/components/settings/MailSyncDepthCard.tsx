'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-client'
import { DEFAULT_MAIL_SYNC_LOOKBACK_MONTHS } from '@/lib/mail-sync-lookback'

const OPTIONS: { months: number; label: string }[] = [
  { months: 3, label: '3 mois' },
  { months: 6, label: '6 mois' },
  { months: 12, label: '12 mois' },
  { months: 24, label: '24 mois' },
  { months: 36, label: '36 mois' },
  { months: 0, label: 'Tout l’historique' },
]

export default function MailSyncDepthCard({ onSaved, onError }: {
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [months, setMonths] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    authFetch('/api/user-settings')
      .then(r => r.json())
      .then(json => { if (!cancelled) setMonths(json.success ? json.data.mail_sync_lookback_months ?? DEFAULT_MAIL_SYNC_LOOKBACK_MONTHS : DEFAULT_MAIL_SYNC_LOOKBACK_MONTHS) })
      .catch(() => { if (!cancelled) setMonths(DEFAULT_MAIL_SYNC_LOOKBACK_MONTHS) })
    return () => { cancelled = true }
  }, [])

  const change = async (next: number) => {
    const prev = months
    setMonths(next)
    setSaving(true)
    try {
      const res = await authFetch('/api/user-settings', { method: 'PATCH', body: JSON.stringify({ mail_sync_lookback_months: next }) })
      const json = await res.json()
      if (json.success) onSaved()
      else { setMonths(prev); onError(json.error ?? 'Erreur sauvegarde') }
    } catch (e: unknown) {
      setMonths(prev)
      onError(e instanceof Error ? e.message : 'Erreur réseau')
    }
    setSaving(false)
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Historique importé</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Profondeur de l’import lors de la première synchronisation d’un compte (boîte de réception et envoyés).
        Ce réglage ne supprime rien : les mails déjà importés restent tels quels.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {OPTIONS.map(o => {
          const active = months === o.months
          return (
            <button
              key={o.months} type="button" disabled={months === null || saving} onClick={() => change(o.months)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                border: active ? '1px solid #3B7FE8' : '1px solid var(--border)',
                background: active ? '#3B7FE8' : 'var(--bg-secondary)',
                color: active ? '#fff' : 'var(--text-secondary)',
              }}
            >{o.label}</button>
          )
        })}
      </div>
    </div>
  )
}
