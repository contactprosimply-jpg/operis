'use client'

import { useEffect, useRef, useState } from 'react'
import { authFetch } from '@/lib/auth-client'
import { Spinner } from '@/components/ui'
import type { NotificationSettings } from '@/lib/notification-settings'

const HOURS = [6, 7, 8, 9, 10, 11, 12]

export default function NotificationsSection({ onSaved, onError }: {
  onSaved: () => void
  onError?: (message: string) => void
}) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [saving, setSaving] = useState(false)
  // Callback parent recréé à chaque rendu : on le garde en ref pour ne charger les réglages qu'une fois.
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError })

  useEffect(() => {
    let cancelled = false
    authFetch('/api/notification-settings')
      .then(r => r.json())
      .then(d => { if (!cancelled && d.success) setSettings(d.data as NotificationSettings) })
      .catch(() => { if (!cancelled) onErrorRef.current?.('Impossible de charger les réglages') })
    return () => { cancelled = true }
  }, [])

  const save = async (patch: Partial<Pick<NotificationSettings, 'digest_enabled' | 'digest_hour'>>) => {
    if (!settings) return
    const previous = settings
    setSettings({ ...settings, ...patch })
    setSaving(true)
    try {
      const res = await authFetch('/api/notification-settings', { method: 'PATCH', body: JSON.stringify(patch) })
      const data = await res.json()
      if (data.success) {
        setSettings(data.data as NotificationSettings)
        onSaved()
      } else {
        setSettings(previous)
        onError?.(data.error ?? 'Enregistrement impossible')
      }
    } catch {
      setSettings(previous)
      onError?.('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner size={22} /></div>
  }

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
      padding: 'clamp(16px, 4vw, 24px)', boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Récap du matin</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 16px' }}>
        Chaque jour ouvré, un e-mail et un rappel dans la cloche listent ce qui reste à traiter : devis reçus,
        questions de vos fournisseurs, mails importants sans réponse et échéances proches. Rien n&apos;est envoyé
        quand il n&apos;y a rien à traiter. La liste s&apos;ouvre aussi toute seule, en fenêtre, à votre première
        connexion de la journée (et reste accessible à tout moment par le bouton « À traiter »).
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '12px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Recevoir le récap du matin</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Du lundi au vendredi, heure de Paris.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.digest_enabled}
          aria-label="Recevoir le récap du matin"
          disabled={saving}
          onClick={() => void save({ digest_enabled: !settings.digest_enabled })}
          style={{
            width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', flexShrink: 0,
            background: settings.digest_enabled ? '#3B7FE8' : 'var(--border-hi)',
            position: 'relative', transition: 'background 0.15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 3, left: settings.digest_enabled ? 23 : 3, width: 22, height: 22,
            borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>

      <div style={{ marginTop: 20, opacity: settings.digest_enabled ? 1 : 0.5 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Heure d&apos;envoi</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          Vous le recevez à cette heure (ou peu après si notre envoi a pris du retard).
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="radiogroup" aria-label="Heure d'envoi">
          {HOURS.map(h => {
            const active = settings.digest_hour === h
            return (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving || !settings.digest_enabled}
                onClick={() => void save({ digest_hour: h })}
                style={{
                  minHeight: 44, minWidth: 56, padding: '6px 14px', borderRadius: 22, fontSize: 13, fontWeight: 600,
                  cursor: settings.digest_enabled ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans, system-ui',
                  border: active ? '1px solid #3B7FE8' : '1px solid var(--border)',
                  background: active ? '#3B7FE8' : 'var(--bg-secondary)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {h}h
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
