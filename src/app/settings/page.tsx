'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Field, useToast, Spinner } from '@/components/ui'

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = await getToken()
  return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(options.headers ?? {}) } })
}

export default function SettingsPage() {
  const { show, ToastComponent } = useToast()
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingSig, setSavingSig] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [sigMode, setSigMode] = useState<'fields' | 'html'>('fields')

  // IMAP config
  const [imap, setImap] = useState({ imap_host: '', imap_port: '993', imap_user: '', imap_pass: '', smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '' })

  // Signature fields
  const [sig, setSig] = useState({ name: '', title: '', company: '', phone: '', email: '', website: '', html: '' })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await authFetch('/api/mail/accounts')
        const data = await res.json()
        if (data.success && data.data) {
          const a = data.data
          setImap({ imap_host: a.imap_host ?? '', imap_port: String(a.imap_port ?? 993), imap_user: a.imap_user ?? '', imap_pass: '', smtp_host: a.smtp_host ?? '', smtp_port: String(a.smtp_port ?? 587), smtp_user: a.smtp_user ?? '', smtp_pass: '' })
        }
        // Load signature from localStorage
        const savedSig = localStorage.getItem('operis_signature')
        const savedSigMode = localStorage.getItem('operis_signature_mode')
        if (savedSig) setSig(JSON.parse(savedSig))
        if (savedSigMode) setSigMode(savedSigMode as 'fields' | 'html')
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [])

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await authFetch('/api/mail/accounts/test', {
        method: 'POST',
        body: JSON.stringify({ imap_host: imap.imap_host, imap_port: parseInt(imap.imap_port), imap_user: imap.imap_user, imap_pass: imap.imap_pass }),
      })
      const data = await res.json()
      setTestResult({ success: data.success, message: data.success ? `Connexion reussie — ${data.data?.count ?? 0} emails dans INBOX` : `Connexion echouee : ${data.error}` })
    } catch (e: any) { setTestResult({ success: false, message: `Erreur : ${e.message}` }) }
    setTesting(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/mail/accounts', {
        method: 'POST',
        body: JSON.stringify({ imap_host: imap.imap_host, imap_port: parseInt(imap.imap_port), imap_user: imap.imap_user, imap_pass: imap.imap_pass, smtp_host: imap.smtp_host, smtp_port: parseInt(imap.smtp_port), smtp_user: imap.smtp_user || imap.imap_user, smtp_pass: imap.smtp_pass || imap.imap_pass }),
      })
      const data = await res.json()
      if (data.success) show('Configuration sauvegardee')
      else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setSaving(false)
  }

  const handleSaveSig = () => {
    setSavingSig(true)
    localStorage.setItem('operis_signature', JSON.stringify(sig))
    localStorage.setItem('operis_signature_mode', sigMode)
    setTimeout(() => { setSavingSig(false); show('Signature sauvegardee') }, 300)
  }

  const generatedHtml = `<table style="font-family: DM Sans, Arial, sans-serif; font-size: 13px; color: #374151; border-collapse: collapse;">
  <tr><td style="padding-bottom: 2px; font-weight: 600; font-size: 14px; color: #111827;">${sig.name}</td></tr>
  ${sig.title ? `<tr><td style="color: #6b7280; padding-bottom: 2px;">${sig.title}</td></tr>` : ''}
  ${sig.company ? `<tr><td style="color: #6b7280; padding-bottom: 6px;">${sig.company}</td></tr>` : ''}
  <tr><td style="border-top: 2px solid #3b7ef6; padding-top: 8px; color: #6b7280;">
    ${sig.phone ? `📞 ${sig.phone}` : ''} ${sig.email ? `✉ ${sig.email}` : ''} ${sig.website ? `🌐 ${sig.website}` : ''}
  </td></tr>
</table>`

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>

  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px', marginBottom: 20 }
  const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }
  const sectionSub: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 18 }

  return (
    <div style={{ maxWidth: 680 }}>
      {ToastComponent}

      {/* IMAP */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Boite mail IMAP</div>
        <div style={sectionSub}>Connexion pour lire et importer tes emails</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
          <Field label="Serveur IMAP" value={imap.imap_host} onChange={v => setImap(i => ({ ...i, imap_host: v }))} placeholder="mail.gandi.net" />
          <Field label="Port" value={imap.imap_port} onChange={v => setImap(i => ({ ...i, imap_port: v }))} placeholder="993" />
        </div>
        <Field label="Email *" value={imap.imap_user} onChange={v => setImap(i => ({ ...i, imap_user: v }))} placeholder="ton@email.com" type="email" />
        <Field label="Mot de passe *" value={imap.imap_pass} onChange={v => setImap(i => ({ ...i, imap_pass: v }))} placeholder="••••••••" type="password" />
        {testResult && (
          <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 12, background: testResult.success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', color: testResult.success ? '#4ade80' : '#f87171', border: `1px solid ${testResult.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            {testResult.message}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" loading={testing} onClick={handleTest}>Tester la connexion</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>Sauvegarder</Button>
        </div>
      </div>

      {/* SMTP */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Serveur SMTP</div>
        <div style={sectionSub}>Pour envoyer les consultations et relances</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
          <Field label="Serveur SMTP" value={imap.smtp_host} onChange={v => setImap(i => ({ ...i, smtp_host: v }))} placeholder="mail.gandi.net" />
          <Field label="Port" value={imap.smtp_port} onChange={v => setImap(i => ({ ...i, smtp_port: v }))} placeholder="587" />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
          Le meme email et mot de passe que IMAP sont utilises automatiquement si non renseignes.
        </div>
      </div>

      {/* Signature */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Signature email</div>
        <div style={sectionSub}>Ajoutee automatiquement a tous tes emails envoyes depuis Operis</div>

        {/* Mode switch */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
          {[{ key: 'fields', label: 'Champs structures' }, { key: 'html', label: 'HTML libre' }].map(m => (
            <button key={m.key} onClick={() => setSigMode(m.key as 'fields' | 'html')} style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: 'none', background: sigMode === m.key ? 'var(--accent-soft)' : 'transparent', color: sigMode === m.key ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'DM Sans, system-ui' }}>
              {m.label}
            </button>
          ))}
        </div>

        {sigMode === 'fields' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Nom complet" value={sig.name} onChange={v => setSig(s => ({ ...s, name: v }))} placeholder="Uros Baralic" />
              <Field label="Titre / Poste" value={sig.title} onChange={v => setSig(s => ({ ...s, title: v }))} placeholder="Responsable BTP" />
              <Field label="Societe" value={sig.company} onChange={v => setSig(s => ({ ...s, company: v }))} placeholder="Nikodex" />
              <Field label="Telephone" value={sig.phone} onChange={v => setSig(s => ({ ...s, phone: v }))} placeholder="+33 6 XX XX XX XX" />
              <Field label="Email" value={sig.email} onChange={v => setSig(s => ({ ...s, email: v }))} placeholder="b.uros@nikodex.fr" />
              <Field label="Site web" value={sig.website} onChange={v => setSig(s => ({ ...s, website: v }))} placeholder="www.nikodex.fr" />
            </div>

            {/* Preview */}
            {sig.name && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, marginTop: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}>Apercu</div>
                <div dangerouslySetInnerHTML={{ __html: generatedHtml }} />
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>Code HTML</div>
              <textarea value={sig.html} onChange={e => setSig(s => ({ ...s, html: e.target.value }))}
                rows={8} placeholder="<table>...</table>"
                style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '10px 13px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'DM Mono, monospace', outline: 'none', resize: 'vertical' }} />
            </div>
            {sig.html && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}>Apercu</div>
                <div dangerouslySetInnerHTML={{ __html: sig.html }} />
              </div>
            )}
          </>
        )}

        <Button variant="primary" loading={savingSig} onClick={handleSaveSig}>Sauvegarder la signature</Button>
      </div>

      {/* Options avancees */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Synchronisation IMAP</div>
        <div style={sectionSub}>Lance la synchro manuellement depuis ton PC avec la commande :</div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#4ade80' }}>
          node sync.mjs
        </div>
      </div>
    </div>
  )
}
