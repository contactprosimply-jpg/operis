'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-client'
import { Button, Spinner } from '@/components/ui'
import {
  cacheUserSettingsLocally,
  readCachedUserSettings,
  type UserSettings,
} from '@/lib/user-settings'

function PillGroup<T extends number>({
  label,
  hint,
  options,
  value,
  onChange,
  format = v => `${v}j`,
}: {
  label: string
  hint?: string
  options: T[]
  value: T
  onChange: (v: T) => void
  format?: (v: T) => string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{hint}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(opt => {
          const active = opt === value
          return (
            <button
              key={String(opt)}
              type="button"
              onClick={() => onChange(opt)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
                border: active ? '1px solid #3B7FE8' : '1px solid var(--border)',
                background: active ? '#3B7FE8' : 'var(--bg-secondary)',
                color: active ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {format(opt)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
      padding: '12px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: checked ? '#3B7FE8' : 'var(--border-hi)',
          position: 'relative', transition: 'background 0.15s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: checked ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  )
}

export default function MailRelancesSection({
  onSaved,
  onError,
}: {
  onSaved: () => void
  onError?: (message: string) => void
}) {
  const [loading, setLoading] = useState(true)
  const [savingSig, setSavingSig] = useState(false)
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await authFetch('/api/user-settings')
      const data = await res.json()
      if (data.success) {
        setSettings(data.data as UserSettings)
        cacheUserSettingsLocally(data.data as UserSettings)
      } else {
        const cached = readCachedUserSettings()
        if (cached) setSettings(cached)
        setLoadError(data.error ?? 'Impossible de charger les paramètres')
        onError?.(data.error ?? 'Impossible de charger les paramètres')
      }
    } catch (e: unknown) {
      const cached = readCachedUserSettings()
      if (cached) setSettings(cached)
      const msg = e instanceof Error ? e.message : 'Erreur réseau'
      setLoadError(msg)
      onError?.(msg)
    }
    setLoading(false)
  }, [onError])

  useEffect(() => { void load() }, [load])

  const patchSetting = async (patch: Partial<UserSettings>) => {
    if (!settings) return
    const prev = { ...settings }
    const next = { ...settings, ...patch }
    setSettings(next)
    cacheUserSettingsLocally(next)
    try {
      const res = await authFetch('/api/user-settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (data.success) {
        setSettings(data.data as UserSettings)
        cacheUserSettingsLocally(data.data as UserSettings)
        if (data.persisted === false && data.warning) {
          setLoadError(data.warning)
        } else {
          setLoadError(null)
        }
        onSaved()
      } else {
        setSettings(prev)
        cacheUserSettingsLocally(prev)
        const err = data.error ?? 'Erreur sauvegarde'
        setLoadError(err)
        onError?.(err)
      }
    } catch (e: unknown) {
      setSettings(prev)
      cacheUserSettingsLocally(prev)
      const msg = e instanceof Error ? e.message : 'Erreur réseau'
      setLoadError(msg)
      onError?.(msg)
    }
  }

  const saveSignature = async () => {
    if (!settings) return
    setSavingSig(true)
    try {
      const res = await authFetch('/api/user-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          mail_signature: settings.mail_signature,
          mail_signature_enabled: settings.mail_signature_enabled,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSettings(data.data as UserSettings)
        cacheUserSettingsLocally(data.data as UserSettings)
        if (data.persisted === false && data.warning) {
          setLoadError(data.warning)
        } else {
          setLoadError(null)
        }
        onSaved()
      } else {
        onError?.(data.error ?? 'Erreur signature')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau'
      onError?.(msg)
    }
    setSavingSig(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner size={24} />
      </div>
    )
  }

  if (!settings) {
    return (
      <div style={{
        padding: 16, borderRadius: 8, background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.25)', fontSize: 13, color: '#f87171',
      }}>
        {loadError ?? 'Paramètres indisponibles. Réessayez ou contactez le support.'}
        <button
          type="button"
          onClick={() => void load()}
          style={{
            marginTop: 10, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 12,
          }}
        >
          Réessayer
        </button>
      </div>
    )
  }

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '20px 22px', marginBottom: 16,
  }
  const blockTitle: React.CSSProperties = {
    fontSize: 14, fontWeight: 700, color: '#021246', marginBottom: 16,
    display: 'flex', alignItems: 'center', gap: 8,
  }

  return (
    <div>
      {loadError && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 8,
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)',
          fontSize: 12, color: '#fbbf24', lineHeight: 1.5,
        }}>
          {loadError}
        </div>
      )}
      <div style={card}>
        <div style={blockTitle}>🔔 Relances automatiques</div>
        <PillGroup
          label="Délai avant première relance"
          options={[1, 2, 3, 5, 7, 14]}
          value={settings.relance_first_delay_days}
          onChange={v => void patchSetting({ relance_first_delay_days: v })}
        />
        <PillGroup
          label="Délai entre les relances suivantes"
          options={[1, 2, 3, 5, 7]}
          value={settings.relance_interval_days}
          onChange={v => void patchSetting({ relance_interval_days: v })}
        />
        <PillGroup
          label="Nombre maximum de relances"
          options={[1, 2, 3, 5, -1]}
          value={settings.relance_max_count}
          onChange={v => void patchSetting({ relance_max_count: v })}
          format={v => v < 0 ? 'Illimité' : String(v)}
        />
        <Toggle
          label="Relancer uniquement les jours ouvrés"
          checked={settings.relance_working_days_only}
          onChange={v => void patchSetting({ relance_working_days_only: v })}
        />
        <Toggle
          label="M'avertir avant d'envoyer une relance"
          hint="Notification dans Operis avec confirmation avant envoi"
          checked={settings.relance_confirm_before_send}
          onChange={v => void patchSetting({ relance_confirm_before_send: v })}
        />
      </div>

      <div style={card}>
        <div style={blockTitle}>⚡ Étiquettes automatiques</div>
        <Toggle
          label="Activer les étiquettes automatiques"
          checked={settings.auto_labels_enabled}
          onChange={v => void patchSetting({ auto_labels_enabled: v })}
        />
        <PillGroup
          label="Marquer « À traiter » si mail lu sans action depuis"
          options={[12, 24, 48, 72]}
          value={settings.label_a_traiter_delay_hours}
          onChange={v => void patchSetting({ label_a_traiter_delay_hours: v })}
          format={v => `${v}h`}
        />
        <PillGroup
          label="Marquer « En retard » si mail Urgent sans réponse depuis"
          options={[1, 2, 3, 5, 7]}
          value={settings.label_en_retard_delay_days}
          onChange={v => void patchSetting({ label_en_retard_delay_days: v })}
        />
      </div>

      <div style={card}>
        <div style={blockTitle}>✍️ Signature</div>
        <Toggle
          label="Afficher la signature par défaut"
          checked={settings.mail_signature_enabled}
          onChange={v => setSettings(s => s ? { ...s, mail_signature_enabled: v } : s)}
        />
        <textarea
          value={settings.mail_signature}
          onChange={e => setSettings(s => s ? { ...s, mail_signature: e.target.value } : s)}
          placeholder="Votre signature (texte ou HTML)…"
          style={{
            width: '100%', maxHeight: 200, minHeight: 120, marginTop: 12,
            padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-secondary)', fontSize: 13, lineHeight: 1.5,
            fontFamily: 'DM Sans, system-ui', color: 'var(--text-primary)', resize: 'vertical',
          }}
        />
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" loading={savingSig} onClick={() => void saveSignature()}>
            Enregistrer la signature
          </Button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
          La signature des champs structurés reste disponible dans l&apos;onglet Signature.
        </div>
      </div>
    </div>
  )
}
