'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-client'
import { Button, Spinner } from '@/components/ui'
import { cacheUserSettingsLocally, type UserSettings } from '@/lib/user-settings'

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
}: {
  onSaved: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [savingSig, setSavingSig] = useState(false)
  const [settings, setSettings] = useState<UserSettings | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/user-settings')
      const data = await res.json()
      if (data.success) {
        setSettings(data.data as UserSettings)
        cacheUserSettingsLocally(data.data as UserSettings)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

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
        onSaved()
      } else {
        setSettings(prev)
        cacheUserSettingsLocally(prev)
      }
    } catch {
      setSettings(prev)
      cacheUserSettingsLocally(prev)
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
        onSaved()
      }
    } catch { /* ignore */ }
    setSavingSig(false)
  }

  if (loading || !settings) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner size={24} />
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
      <div style={card}>
        <div style={blockTitle}>🔔 Relances automatiques</div>
        <PillGroup
          label="Délai avant première relance"
          options={[1, 2, 3, 5, 7, 14]}
          value={settings.relance_first_delay_days}
          onChange={v => patchSetting({ relance_first_delay_days: v })}
        />
        <PillGroup
          label="Délai entre les relances suivantes"
          options={[1, 2, 3, 5, 7]}
          value={settings.relance_interval_days}
          onChange={v => patchSetting({ relance_interval_days: v })}
        />
        <PillGroup
          label="Nombre maximum de relances"
          options={[1, 2, 3, 5, -1]}
          value={settings.relance_max_count}
          onChange={v => patchSetting({ relance_max_count: v })}
          format={v => v < 0 ? 'Illimité' : String(v)}
        />
        <Toggle
          label="Relancer uniquement les jours ouvrés"
          checked={settings.relance_working_days_only}
          onChange={v => patchSetting({ relance_working_days_only: v })}
        />
        <Toggle
          label="M'avertir avant d'envoyer une relance"
          hint="Notification dans Operis avec confirmation avant envoi"
          checked={settings.relance_confirm_before_send}
          onChange={v => patchSetting({ relance_confirm_before_send: v })}
        />
      </div>

      <div style={card}>
        <div style={blockTitle}>⚡ Étiquettes automatiques</div>
        <Toggle
          label="Activer les étiquettes automatiques"
          checked={settings.auto_labels_enabled}
          onChange={v => patchSetting({ auto_labels_enabled: v })}
        />
        <PillGroup
          label="Marquer « À traiter » si mail lu sans action depuis"
          options={[12, 24, 48, 72]}
          value={settings.label_a_traiter_delay_hours}
          onChange={v => patchSetting({ label_a_traiter_delay_hours: v })}
          format={v => `${v}h`}
        />
        <PillGroup
          label="Marquer « En retard » si mail Urgent sans réponse depuis"
          options={[1, 2, 3, 5, 7]}
          value={settings.label_en_retard_delay_days}
          onChange={v => patchSetting({ label_en_retard_delay_days: v })}
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
