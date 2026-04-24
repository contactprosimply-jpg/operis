'use client'

import { useState, useEffect } from 'react'
import { Button, Field, useToast } from '@/components/ui'
import { supabase } from '@/lib/supabase'

interface MailAccount {
  imap_host: string
  imap_port: number
  imap_user: string
  imap_pass: string
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_pass: string
}

const DEFAULT: MailAccount = {
  imap_host: 'mail.gandi.net',
  imap_port: 993,
  imap_user: '',
  imap_pass: '',
  smtp_host: 'mail.gandi.net',
  smtp_port: 587,
  smtp_user: '',
  smtp_pass: '',
}

export default function SettingsPage() {
  const { show, ToastComponent } = useToast()
  const [form, setForm] = useState<MailAccount>(DEFAULT)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [hasConfig, setHasConfig] = useState(false)

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  useEffect(() => {
    const load = async () => {
      const token = await getToken()
      fetch('/api/mail/accounts', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(res => {
          if (res.success && res.data) {
            setForm(f => ({ ...f, ...res.data }))
            setHasConfig(true)
          }
        })
        .catch(() => {})
    }
    load()
  }, [])

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/mail/accounts/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) {
        setTestResult({ ok: true, message: `✓ Connexion réussie — ${data.data.exists} emails dans INBOX` })
      } else {
        setTestResult({ ok: false, message: data.error })
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message })
    }
    setTesting(false)
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/mail/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) {
        show('Configuration sauvegardée ✓')
        setHasConfig(true)
      } else {
        show(`Erreur : ${data.error}`)
      }
    } catch (e: any) {
      show(`Erreur : ${e.message}`)
    }
    setLoading(false)
  }

  const set = (key: keyof MailAccount) => (v: string) =>
    setForm(f => ({ ...f, [key]: v }))

  return (
    <div className="max-w-2xl">
      {ToastComponent}
      <div className="mb-6">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Paramètres</span>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-lg p-6 mb-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-sm font-bold text-white mb-1">Boîte mail IMAP</div>
            <div className="text-xs text-slate-400">Connexion pour lire et importer tes emails</div>
          </div>
          {hasConfig && (
            <span className="font-mono text-[10px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Configuré</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Serveur IMAP" value={form.imap_host} onChange={set('imap_host')} placeholder="mail.gandi.net" />
          <Field label="Port" value={String(form.imap_port)} onChange={v => setForm(f => ({ ...f, imap_port: Number(v) }))} placeholder="993" />
        </div>
        <Field label="Email *" value={form.imap_user} onChange={v => { set('imap_user')(v); set('smtp_user')(v) }} placeholder="ton@email.fr" type="email" />
        <Field label="Mot de passe *" value={form.imap_pass} onChange={v => { set('imap_pass')(v); set('smtp_pass')(v) }} placeholder="••••••••" type="password" />
        {testResult && (
          <div className={`rounded-lg px-4 py-3 mb-4 text-xs ${testResult.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
            {testResult.message}
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" loading={testing} onClick={handleTest}>Tester la connexion</Button>
          <Button variant="primary" loading={loading} onClick={handleSave}>Sauvegarder</Button>
        </div>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-lg p-6">
        <div className="mb-5">
          <div className="text-sm font-bold text-white mb-1">Serveur SMTP</div>
          <div className="text-xs text-slate-400">Pour envoyer les consultations et relances</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Serveur SMTP" value={form.smtp_host} onChange={set('smtp_host')} placeholder="mail.gandi.net" />
          <Field label="Port" value={String(form.smtp_port)} onChange={v => setForm(f => ({ ...f, smtp_port: Number(v) }))} placeholder="587" />
        </div>
        <div className="text-xs text-slate-500 mt-2">Le même email et mot de passe que IMAP sont utilisés automatiquement.</div>
      </div>
    </div>
  )
}