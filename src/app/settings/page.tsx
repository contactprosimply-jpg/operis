'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Field, useToast, Spinner } from '@/components/ui'
import { useTheme } from '@/components/ThemeProvider'

const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = await getToken()
  return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(options.headers ?? {}) } })
}

type Tab = 'general' | 'messagerie' | 'apparence' | 'notifications' | 'compte'

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: 'general', label: 'General', icon: '👤' },
  { key: 'messagerie', label: 'Messagerie', icon: '✉️' },
  { key: 'apparence', label: 'Apparence', icon: '🎨' },
  { key: 'notifications', label: 'Notifications', icon: '🔔' },
  { key: 'compte', label: 'Compte', icon: '⚙️' },
]

export default function SettingsPage() {
  const { show, ToastComponent } = useToast()
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [sigMode, setSigMode] = useState<'fields' | 'html'>('fields')

  // General
  const [general, setGeneral] = useState({ name: '', title: '', company: '', language: 'fr' })

  // IMAP
  const [imap, setImap] = useState({ imap_host: 'mail.gandi.net', imap_port: '993', imap_user: '', imap_pass: '', smtp_host: 'mail.gandi.net', smtp_port: '587' })

  // Signature
  const [sig, setSig] = useState({ name: '', title: '', company: '', phone: '', email: '', website: '', html: '' })

  // Notifications
  const [notifs, setNotifs] = useState({ new_email: true, new_ao: true, deadline_3days: true, quote_received: true })

  // Apparence
  const [density, setDensity] = useState<'compact' | 'normal' | 'comfortable'>('normal')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await authFetch('/api/mail/accounts')
        const data = await res.json()
        if (data.success && data.data) {
          const a = data.data
          setImap(i => ({ ...i, imap_host: a.imap_host ?? 'mail.gandi.net', imap_port: String(a.imap_port ?? 993), imap_user: a.imap_user ?? '', smtp_host: a.smtp_host ?? 'mail.gandi.net', smtp_port: String(a.smtp_port ?? 587) }))
        }
        const savedSig = localStorage.getItem('operis_signature')
        const savedSigMode = localStorage.getItem('operis_signature_mode')
        const savedGeneral = localStorage.getItem('operis_general')
        const savedNotifs = localStorage.getItem('operis_notifs')
        const savedDensity = localStorage.getItem('operis_density')
        if (savedSig) setSig(JSON.parse(savedSig))
        if (savedSigMode) setSigMode(savedSigMode as 'fields' | 'html')
        if (savedGeneral) setGeneral(JSON.parse(savedGeneral))
        if (savedNotifs) setNotifs(JSON.parse(savedNotifs))
        if (savedDensity) setDensity(savedDensity as any)
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [])

  const handleTestImap = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await authFetch('/api/mail/accounts/test', { method: 'POST', body: JSON.stringify({ imap_host: imap.imap_host, imap_port: parseInt(imap.imap_port), imap_user: imap.imap_user, imap_pass: imap.imap_pass }) })
      const data = await res.json()
      setTestResult({ success: data.success, message: data.success ? `Connexion reussie — ${data.data?.count ?? 0} emails dans INBOX` : `Connexion echouee : ${data.error}` })
    } catch (e: any) { setTestResult({ success: false, message: `Erreur : ${e.message}` }) }
    setTesting(false)
  }

  const handleSaveImap = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/mail/accounts', { method: 'POST', body: JSON.stringify({ imap_host: imap.imap_host, imap_port: parseInt(imap.imap_port), imap_user: imap.imap_user, imap_pass: imap.imap_pass, smtp_host: imap.smtp_host, smtp_port: parseInt(imap.smtp_port), smtp_user: imap.imap_user, smtp_pass: imap.imap_pass }) })
      const data = await res.json()
      if (data.success) show('Configuration sauvegardee')
      else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setSaving(false)
  }

  const handleSaveSig = () => {
    localStorage.setItem('operis_signature', JSON.stringify(sig))
    localStorage.setItem('operis_signature_mode', sigMode)
    show('Signature sauvegardee')
  }

  const handleSaveGeneral = () => {
    localStorage.setItem('operis_general', JSON.stringify(general))
    show('Profil sauvegarde')
  }

  const handleSaveNotifs = () => {
    localStorage.setItem('operis_notifs', JSON.stringify(notifs))
    show('Notifications sauvegardees')
  }

  const handleSaveDensity = (d: string) => {
    setDensity(d as any)
    localStorage.setItem('operis_density', d)
    show('Apparence sauvegardee')
  }

  const generatedHtml = `<table style="font-family: DM Sans, Arial, sans-serif; font-size: 13px; color: #374151; border-collapse: collapse; margin-top: 8px;">
  <tr><td style="padding-bottom: 2px; font-weight: 600; font-size: 14px; color: #111827;">${sig.name}</td></tr>
  ${sig.title ? `<tr><td style="color: #6b7280; padding-bottom: 2px;">${sig.title}</td></tr>` : ''}
  ${sig.company ? `<tr><td style="color: #6b7280; padding-bottom: 8px;">${sig.company}</td></tr>` : ''}
  <tr><td style="border-top: 2px solid #3b7ef6; padding-top: 8px; color: #6b7280; line-height: 1.8;">
    ${sig.phone ? `📞 ${sig.phone}<br>` : ''}${sig.email ? `✉ ${sig.email}<br>` : ''}${sig.website ? `🌐 ${sig.website}` : ''}
  </td></tr>
</table>`

  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }
  const sectionSub: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 80px)' }}>
      {ToastComponent}

      {/* Sidebar onglets */}
      <div style={{ width: 180, flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 12 }}>Parametres</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
              border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
              background: activeTab === tab.key ? 'var(--accent-soft)' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 13, fontFamily: 'DM Sans, system-ui',
              fontWeight: activeTab === tab.key ? 500 : 400,
            }}>
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>

        {/* GENERAL */}
        {activeTab === 'general' && (
          <div>
            <div style={cardStyle}>
              <div style={sectionTitle}>Profil utilisateur</div>
              <div style={sectionSub}>Informations affichees dans l'application</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Nom complet" value={general.name} onChange={v => setGeneral(g => ({ ...g, name: v }))} placeholder="Uros Baralic" />
                <Field label="Titre / Poste" value={general.title} onChange={v => setGeneral(g => ({ ...g, title: v }))} placeholder="Responsable BTP" />
                <Field label="Societe" value={general.company} onChange={v => setGeneral(g => ({ ...g, company: v }))} placeholder="Nikodex" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>Langue</div>
                <select value={general.language} onChange={e => setGeneral(g => ({ ...g, language: e.target.value }))}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', outline: 'none' }}>
                  <option value="fr">Francais</option>
                  <option value="en">English</option>
                </select>
              </div>
              <Button variant="primary" onClick={handleSaveGeneral}>Sauvegarder</Button>
            </div>
          </div>
        )}

        {/* MESSAGERIE */}
        {activeTab === 'messagerie' && (
          <div>
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
                <Button variant="ghost" loading={testing} onClick={handleTestImap}>Tester</Button>
                <Button variant="primary" loading={saving} onClick={handleSaveImap}>Sauvegarder</Button>
              </div>
            </div>

            {/* SMTP */}
            <div style={cardStyle}>
              <div style={sectionTitle}>Serveur SMTP</div>
              <div style={sectionSub}>Pour envoyer les emails depuis Operis</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                <Field label="Serveur SMTP" value={imap.smtp_host} onChange={v => setImap(i => ({ ...i, smtp_host: v }))} placeholder="mail.gandi.net" />
                <Field label="Port" value={imap.smtp_port} onChange={v => setImap(i => ({ ...i, smtp_port: v }))} placeholder="587" />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                Email et mot de passe IMAP utilises automatiquement.
              </div>
            </div>

            {/* Signature */}
            <div style={cardStyle}>
              <div style={sectionTitle}>Signature email</div>
              <div style={sectionSub}>Ajoutee automatiquement a tous tes emails</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                {[{ key: 'fields', label: 'Champs structures' }, { key: 'html', label: 'HTML libre' }].map(m => (
                  <button key={m.key} onClick={() => setSigMode(m.key as 'fields' | 'html')} style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: 'none', background: sigMode === m.key ? 'var(--accent-soft)' : 'var(--bg-secondary)', color: sigMode === m.key ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'DM Sans, system-ui' }}>
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
                    <Field label="Email de contact" value={sig.email} onChange={v => setSig(s => ({ ...s, email: v }))} placeholder="b.uros@nikodex.fr" />
                    <Field label="Site web" value={sig.website} onChange={v => setSig(s => ({ ...s, website: v }))} placeholder="www.nikodex.fr" />
                  </div>
                  {sig.name && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, margin: '12px 0' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}>Apercu</div>
                      <div dangerouslySetInnerHTML={{ __html: generatedHtml }} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 6 }}>Code HTML</div>
                    <textarea value={sig.html} onChange={e => setSig(s => ({ ...s, html: e.target.value }))} rows={8}
                      placeholder="Colle ton HTML de signature ici..."
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
              <Button variant="primary" onClick={handleSaveSig}>Sauvegarder la signature</Button>
            </div>

            {/* Sync */}
            <div style={cardStyle}>
              <div style={sectionTitle}>Synchronisation IMAP locale</div>
              <div style={sectionSub}>Lance depuis ton PC — les emails apparaissent en temps reel dans Operis via Supabase Realtime</div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#4ade80', marginBottom: 8 }}>
                node sync.mjs
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#60a5fa' }}>
                node sync-auto.mjs &nbsp;← sync automatique toutes les 2h
              </div>
            </div>
          </div>
        )}

        {/* APPARENCE */}
        {activeTab === 'apparence' && (
          <div>
            <div style={cardStyle}>
              <div style={sectionTitle}>Theme</div>
              <div style={sectionSub}>Choisis le theme de l'interface</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { key: 'dark', label: 'Sombre', preview: '#0f1117', text: '#f1f3f9' },
                  { key: 'light', label: 'Clair', preview: '#f8f9fc', text: '#0f1117' },
                  { key: 'system', label: 'Systeme', preview: 'linear-gradient(135deg, #0f1117 50%, #f8f9fc 50%)', text: '#6b7280' },
                ].map(t => (
                  <button key={t.key} onClick={() => setTheme(t.key as any)} style={{
                    border: `2px solid ${theme === t.key ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 10, padding: 0, cursor: 'pointer', overflow: 'hidden', background: 'transparent',
                  }}>
                    <div style={{ height: 60, background: t.preview }} />
                    <div style={{ padding: '8px 12px', background: 'var(--bg-card)', fontSize: 12, color: theme === t.key ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: theme === t.key ? 600 : 400, fontFamily: 'DM Sans, system-ui' }}>
                      {t.label} {theme === t.key && '✓'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitle}>Densite d'affichage</div>
              <div style={sectionSub}>Ajuste l'espacement des elements</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['compact', 'normal', 'comfortable'].map(d => (
                  <button key={d} onClick={() => handleSaveDensity(d)} style={{
                    padding: '7px 16px', borderRadius: 8, border: `1px solid ${density === d ? 'var(--accent)' : 'var(--border)'}`,
                    background: density === d ? 'var(--accent-soft)' : 'transparent',
                    color: density === d ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui', textTransform: 'capitalize',
                  }}>
                    {d === 'compact' ? 'Compact' : d === 'normal' ? 'Normal' : 'Spacieux'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <div style={cardStyle}>
            <div style={sectionTitle}>Notifications</div>
            <div style={sectionSub}>Choisir quand etre notifie dans Operis</div>
            {[
              { key: 'new_email', label: 'Nouvel email recu', desc: 'Badge dans la messagerie' },
              { key: 'new_ao', label: 'AO detecte automatiquement', desc: 'Un email correspond a un appel d\'offres' },
              { key: 'deadline_3days', label: 'Deadline dans moins de 3 jours', desc: 'Alerte rouge sur le dashboard' },
              { key: 'quote_received', label: 'Devis recu', desc: 'Un fournisseur a repondu' },
            ].map(n => (
              <div key={n.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{n.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{n.desc}</div>
                </div>
                <button onClick={() => setNotifs(no => ({ ...no, [n.key]: !(no as any)[n.key] }))} style={{
                  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                  background: (notifs as any)[n.key] ? 'var(--accent)' : 'var(--border-hi)',
                  position: 'relative', transition: 'background 0.2s',
                }}>
                  <span style={{
                    position: 'absolute', top: 2, left: (notifs as any)[n.key] ? 20 : 2,
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', display: 'block',
                  }} />
                </button>
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <Button variant="primary" onClick={handleSaveNotifs}>Sauvegarder</Button>
            </div>
          </div>
        )}

        {/* COMPTE */}
        {activeTab === 'compte' && (
          <div>
            <div style={cardStyle}>
              <div style={sectionTitle}>Abonnement</div>
              <div style={sectionSub}>Plan actuel</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--accent-soft)', border: '1px solid rgba(59,126,246,0.2)', borderRadius: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⚡</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Operis Pro</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Acces complet a toutes les fonctionnalites</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pour gerer ton abonnement, contacte <span style={{ color: 'var(--accent)' }}>support@operis.fr</span></div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitle}>Donnees et confidentialite</div>
              <div style={sectionSub}>Export et suppression de tes donnees</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost">Exporter mes donnees</Button>
                <Button variant="danger">Supprimer mon compte</Button>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitle}>Version</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                Operis v5.0 — Build 2026
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
