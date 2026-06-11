'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authFetch } from '@/lib/auth-client'
import { Button, Field, ProgressBar } from '@/components/ui'

const STORAGE_KEY = 'operis_onboarding_step'

const PRESETS = {
  gandi: {
    label: 'Gandi',
    imap_host: 'mail.gandi.net', imap_port: '993',
    smtp_host: 'mail.gandi.net', smtp_port: '587',
  },
  gmail: {
    label: 'Gmail',
    imap_host: 'imap.gmail.com', imap_port: '993',
    smtp_host: 'smtp.gmail.com', smtp_port: '587',
  },
  outlook: {
    label: 'Outlook',
    imap_host: 'outlook.office365.com', imap_port: '993',
    smtp_host: 'smtp.office365.com', smtp_port: '587',
  },
}

interface OnboardingProps {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [mailForm, setMailForm] = useState({
    imap_host: PRESETS.gandi.imap_host,
    imap_port: PRESETS.gandi.imap_port,
    imap_user: '',
    imap_pass: '',
    smtp_host: PRESETS.gandi.smtp_host,
    smtp_port: PRESETS.gandi.smtp_port,
    smtp_user: '',
    smtp_pass: '',
  })
  const [supplierForm, setSupplierForm] = useState({ name: '', email: '', specialty: '' })
  const [suppliersAdded, setSuppliersAdded] = useState(0)
  const [tenderForm, setTenderForm] = useState({ title: '', client: '', deadline: '' })
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setStep(Math.min(3, Math.max(1, parseInt(saved, 10) || 1)))

    authFetch('/api/mail/accounts')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setStep(prev => prev === 1 ? 2 : prev)
          localStorage.setItem(STORAGE_KEY, '2')
        }
      })
      .catch(() => {})
  }, [])

  const goStep = (n: number) => {
    setStep(n)
    localStorage.setItem(STORAGE_KEY, String(n))
    setError(null)
  }

  const applyPreset = (key: keyof typeof PRESETS) => {
    const p = PRESETS[key]
    setMailForm(f => ({
      ...f,
      imap_host: p.imap_host,
      imap_port: p.imap_port,
      smtp_host: p.smtp_host,
      smtp_port: p.smtp_port,
    }))
  }

  const testMail = async () => {
    setTesting(true)
    setError(null)
    try {
      const res = await authFetch('/api/mail/accounts/test', {
        method: 'POST',
        body: JSON.stringify({
          imap_host: mailForm.imap_host,
          imap_port: mailForm.imap_port,
          imap_user: mailForm.imap_user,
          imap_pass: mailForm.imap_pass,
        }),
      })
      const data = await res.json()
      if (!data.success) setError(data.error ?? 'Test échoué')
    } catch {
      setError('Erreur réseau')
    }
    setTesting(false)
  }

  const saveMail = async () => {
    if (!mailForm.imap_user || !mailForm.imap_pass) {
      setError('Email et mot de passe requis')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await authFetch('/api/mail/accounts', {
        method: 'POST',
        body: JSON.stringify({
          ...mailForm,
          smtp_user: mailForm.smtp_user || mailForm.imap_user,
          smtp_pass: mailForm.smtp_pass || mailForm.imap_pass,
        }),
      })
      const data = await res.json()
      if (data.success) goStep(2)
      else setError(data.error ?? 'Erreur sauvegarde')
    } catch {
      setError('Erreur réseau')
    }
    setSaving(false)
  }

  const addSupplier = async () => {
    if (!supplierForm.name.trim()) {
      setError('Nom du fournisseur requis')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await authFetch('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: supplierForm.name,
          email: supplierForm.email || null,
          specialty: supplierForm.specialty || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuppliersAdded(n => n + 1)
        setSupplierForm({ name: '', email: '', specialty: '' })
      } else setError(data.error ?? 'Erreur')
    } catch {
      setError('Erreur réseau')
    }
    setSaving(false)
  }

  const createTender = async () => {
    if (!tenderForm.title.trim() || !tenderForm.client.trim()) {
      setError('Titre et client requis')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await authFetch('/api/tenders', {
        method: 'POST',
        body: JSON.stringify({
          title: tenderForm.title,
          client: tenderForm.client,
          deadline: tenderForm.deadline || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        await finishOnboarding(data.data?.id)
      } else setError(data.error ?? 'Erreur')
    } catch {
      setError('Erreur réseau')
    }
    setSaving(false)
  }

  const finishOnboarding = async (tenderId?: string) => {
    await authFetch('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ onboarding_done: true }),
    })
    localStorage.removeItem(STORAGE_KEY)
    onComplete()
    if (tenderId) router.push(`/tenders/${tenderId}`)
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-hi)',
    borderRadius: 14,
    padding: '28px 32px',
    maxWidth: 560,
    margin: '0 auto',
    boxShadow: 'var(--shadow-md)',
  }

  return (
    <div style={{ animation: 'fadeIn 0.4s ease', marginBottom: 32 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          Bienvenue sur Operis
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Messagerie obligatoire — fournisseurs et premier AO optionnels (vous pouvez passer)
        </p>
      </div>

      <div style={{ marginBottom: 20, maxWidth: 560, margin: '0 auto 20px' }}>
        <ProgressBar value={(step / 3) * 100} />
      </div>

      <div style={cardStyle}>
        {step === 1 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
              Étape 1 — Configurer la messagerie
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => applyPreset(k)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
                    border: '1px solid var(--border-hi)', background: 'var(--bg-hover)',
                    color: 'var(--text-secondary)', fontFamily: 'DM Sans, system-ui',
                  }}
                >
                  {PRESETS[k].label}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="IMAP host" value={mailForm.imap_host} onChange={v => setMailForm(f => ({ ...f, imap_host: v }))} />
              <Field label="IMAP port" value={mailForm.imap_port} onChange={v => setMailForm(f => ({ ...f, imap_port: v }))} />
              <Field label="Email" value={mailForm.imap_user} onChange={v => setMailForm(f => ({ ...f, imap_user: v, smtp_user: v }))} />
              <Field
                label="Mot de passe mail"
                value={mailForm.imap_pass}
                onChange={v => setMailForm(f => ({ ...f, imap_pass: v }))}
                type="password"
                name="operis-imap-app-password"
                autoComplete="new-password"
                preventAutofill
                placeholder="Mot de passe du serveur mail (pas Operis)"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button variant="ghost" onClick={testMail} loading={testing}>Tester la connexion</Button>
              <Button onClick={saveMail} loading={saving}>Enregistrer et continuer</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
              Étape 2 — Ajouter des fournisseurs ({suppliersAdded} ajouté{suppliersAdded > 1 ? 's' : ''})
            </div>
            <Field label="Nom" value={supplierForm.name} onChange={v => setSupplierForm(f => ({ ...f, name: v }))} placeholder="Ex: Technomarket" />
            <Field label="Email" value={supplierForm.email} onChange={v => setSupplierForm(f => ({ ...f, email: v }))} placeholder="contact@fournisseur.fr" />
            <Field label="Spécialité" value={supplierForm.specialty} onChange={v => setSupplierForm(f => ({ ...f, specialty: v }))} placeholder="Électricité, plomberie…" />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <Button variant="ghost" onClick={addSupplier} loading={saving}>+ Ajouter</Button>
              <Button onClick={() => goStep(3)}>Continuer</Button>
              <Button variant="ghost" onClick={() => goStep(3)}>Passer cette étape</Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
              Étape 3 — Créer votre premier AO
            </div>
            <Field label="Titre" value={tenderForm.title} onChange={v => setTenderForm(f => ({ ...f, title: v }))} placeholder="Rénovation immeuble…" />
            <Field label="Client" value={tenderForm.client} onChange={v => setTenderForm(f => ({ ...f, client: v }))} placeholder="Nom du client" />
            <Field label="Deadline" value={tenderForm.deadline} onChange={v => setTenderForm(f => ({ ...f, deadline: v }))} type="date" />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <Button onClick={createTender} loading={saving}>Créer et commencer</Button>
              <Button variant="ghost" onClick={() => finishOnboarding()} loading={saving}>
                Passer cette étape
              </Button>
            </div>
          </>
        )}

        {error && (
          <div style={{ marginTop: 16, fontSize: 12, color: '#f87171', fontFamily: 'DM Mono, monospace' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
