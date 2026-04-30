'use client'

import { useState, useEffect, useRef } from 'react'
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

const THEMES = [
  { id: 'dark',    label: 'Sombre',    vars: { '--bg-primary': '#0f1117', '--bg-secondary': '#1a1d27', '--bg-card': '#1e2130', '--bg-hover': '#252839', '--text-primary': '#f1f3f9', '--text-secondary': '#8b92a5', '--text-muted': '#4a5168' } },
  { id: 'light',   label: 'Clair',     vars: { '--bg-primary': '#f8fafc', '--bg-secondary': '#f1f5f9', '--bg-card': '#ffffff', '--bg-hover': '#e2e8f0', '--text-primary': '#0f172a', '--text-secondary': '#475569', '--text-muted': '#94a3b8' } },
  { id: 'navy',    label: 'Marine',    vars: { '--bg-primary': '#021246', '--bg-secondary': '#0a1f6e', '--bg-card': '#0d2580', '--bg-hover': '#1030a0', '--text-primary': '#e8eeff', '--text-secondary': '#93aedd', '--text-muted': '#4a6aaa' } },
  { id: 'slate',   label: 'Ardoise',   vars: { '--bg-primary': '#0f172a', '--bg-secondary': '#1e293b', '--bg-card': '#1e293b', '--bg-hover': '#334155', '--text-primary': '#f1f5f9', '--text-secondary': '#94a3b8', '--text-muted': '#475569' } },
  { id: 'darker',  label: 'Noir',      vars: { '--bg-primary': '#000000', '--bg-secondary': '#0a0a0a', '--bg-card': '#111111', '--bg-hover': '#1a1a1a', '--text-primary': '#ffffff', '--text-secondary': '#aaaaaa', '--text-muted': '#555555' } },
]

const ACCENT_COLORS = ['#3b7ef6', '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316']

const MEMBER_COLORS = ['#3b7ef6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#06b6d4']

const TABS = [
  { id: 'general',    label: 'General',    icon: '⚙' },
  { id: 'messagerie', label: 'Messagerie', icon: '✉' },
  { id: 'signature',  label: 'Signature',  icon: '✍' },
  { id: 'famille',    label: 'Famille',    icon: '👥' },
  { id: 'apparence',  label: 'Apparence',  icon: '🎨' },
]

export default function SettingsPage() {
  const { show, ToastComponent } = useToast()
  const [tab, setTab] = useState('general')
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [sigMode, setSigMode] = useState<'fields' | 'html'>('fields')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachmentName, setAttachmentName] = useState('')

  const [general, setGeneral] = useState({ companyName: '', userName: '' })
  const [imap, setImap] = useState({ imap_host: 'mail.gandi.net', imap_port: '993', imap_user: '', imap_pass: '', smtp_host: 'mail.gandi.net', smtp_port: '587' })
  const [sig, setSig] = useState({ name: '', title: '', company: '', phone: '', email: '', website: '', html: '' })
  const [themeId, setThemeId] = useState('dark')
  const [accentColor, setAccentColor] = useState('#3b7ef6')

  // Famille
  const [org, setOrg] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteColor, setInviteColor] = useState('#3b7ef6')
  const [inviting, setInviting] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await authFetch('/api/mail/accounts')
        const data = await res.json()
        if (data.success && data.data) {
          const a = data.data
          setImap(i => ({ ...i, imap_host: a.imap_host ?? 'mail.gandi.net', imap_port: String(a.imap_port ?? 993), imap_user: a.imap_user ?? '' }))
        }
        const savedSig = localStorage.getItem('operis_signature')
        const savedSigMode = localStorage.getItem('operis_signature_mode')
        const savedTheme = localStorage.getItem('operis_theme')
        const savedAccent = localStorage.getItem('operis_accent')
        const savedGeneral = localStorage.getItem('operis_general')
        const savedAttachment = localStorage.getItem('operis_signature_attachment')
        if (savedSig) setSig(JSON.parse(savedSig))
        if (savedSigMode) setSigMode(savedSigMode as 'fields' | 'html')
        if (savedTheme) setThemeId(savedTheme)
        if (savedAccent) setAccentColor(savedAccent)
        if (savedGeneral) setGeneral(JSON.parse(savedGeneral))
        if (savedAttachment) setAttachmentName(savedAttachment)

        // Load org
        const orgRes = await authFetch('/api/organization')
        const orgData = await orgRes.json()
        if (orgData.success && orgData.data) {
          setOrg(orgData.data)
          setMembers(orgData.data.organization_members ?? [])
        }
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [])

  const applyTheme = (id: string, accent: string) => {
    const t = THEMES.find(th => th.id === id) ?? THEMES[0]
    Object.entries(t.vars).forEach(([key, val]) => {
      document.documentElement.style.setProperty(key, val)
    })
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-soft', `${accent}20`)
    document.documentElement.style.setProperty('--border', id === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)')
    document.documentElement.style.setProperty('--border-hi', id === 'light' ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.12)')
  }

  const handleSaveGeneral = () => {
    localStorage.setItem('operis_general', JSON.stringify(general))
    show('Sauvegardes')
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await authFetch('/api/mail/accounts/test', { method: 'POST', body: JSON.stringify({ imap_host: imap.imap_host, imap_port: parseInt(imap.imap_port), imap_user: imap.imap_user, imap_pass: imap.imap_pass }) })
      const data = await res.json()
      setTestResult({ success: data.success, message: data.success ? `Connexion reussie — ${data.data?.count ?? 0} emails` : `Echec : ${data.error}` })
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

  const handleSaveTheme = () => {
    localStorage.setItem('operis_theme', themeId)
    localStorage.setItem('operis_accent', accentColor)
    applyTheme(themeId, accentColor)
    show('Theme applique')
  }

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return
    setCreatingOrg(true)
    try {
      const res = await authFetch('/api/organization', { method: 'POST', body: JSON.stringify({ name: orgName }) })
      const data = await res.json()
      if (data.success) { setOrg(data.data); show('Organisation creee') }
      else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setCreatingOrg(false)
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await authFetch('/api/organization', { method: 'PUT', body: JSON.stringify({ action: 'invite', email: inviteEmail, display_name: inviteName, color: inviteColor }) })
      const data = await res.json()
      if (data.success) {
        show(`${inviteEmail} ajoute a la famille`)
        setInviteEmail(''); setInviteName('')
        const orgRes = await authFetch('/api/organization')
        const orgData = await orgRes.json()
        if (orgData.success && orgData.data) setMembers(orgData.data.organization_members ?? [])
      } else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setInviting(false)
  }

  const handleRemoveMember = async (memberId: string, name: string) => {
    if (!confirm(`Retirer ${name} de la famille ?`)) return
    await authFetch('/api/organization', { method: 'PUT', body: JSON.stringify({ action: 'remove', member_id: memberId }) })
    setMembers(m => m.filter(x => x.id !== memberId))
    show(`${name} retire`)
  }

  const generatedHtml = `<table style="font-family: DM Sans, Arial, sans-serif; font-size: 13px; color: #374151;">
  <tr><td style="font-weight: 600; font-size: 14px; color: #111827; padding-bottom: 2px;">${sig.name}</td></tr>
  ${sig.title ? `<tr><td style="color: #6b7280; padding-bottom: 2px;">${sig.title}</td></tr>` : ''}
  ${sig.company ? `<tr><td style="color: #6b7280; padding-bottom: 8px;">${sig.company}</td></tr>` : ''}
  <tr><td style="border-top: 2px solid ${accentColor}; padding-top: 8px; color: #6b7280; line-height: 1.8;">
    ${sig.phone ? `📞 ${sig.phone}<br>` : ''}${sig.email ? `✉ ${sig.email}<br>` : ''}${sig.website ? `🌐 ${sig.website}` : ''}
  </td></tr>
</table>`

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }
  const sTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }
  const sSub: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 18 }

  return (
    <div>
      {ToastComponent}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.12s', fontFamily: 'DM Sans, system-ui',
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 660 }}>

        {/* GENERAL */}
        {tab === 'general' && (
          <div style={card}>
            <div style={sTitle}>Informations generales</div>
            <div style={sSub}>Parametres de base de votre compte Operis</div>
            <Field label="Nom de la societe" value={general.companyName} onChange={v => setGeneral(g => ({ ...g, companyName: v }))} placeholder="Ex: Nikodex" />
            <Field label="Votre nom" value={general.userName} onChange={v => setGeneral(g => ({ ...g, userName: v }))} placeholder="Ex: Uros Baralic" />
            <Button variant="primary" onClick={handleSaveGeneral}>Sauvegarder</Button>
          </div>
        )}

        {/* MESSAGERIE */}
        {tab === 'messagerie' && (
          <>
            <div style={card}>
              <div style={sTitle}>Serveur IMAP</div>
              <div style={sSub}>Connexion pour lire et importer tes emails</div>
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
                <Button variant="ghost" loading={testing} onClick={handleTest}>Tester</Button>
                <Button variant="primary" loading={saving} onClick={handleSaveImap}>Sauvegarder</Button>
              </div>
            </div>
            <div style={card}>
              <div style={sTitle}>Serveur SMTP</div>
              <div style={sSub}>Pour envoyer les emails depuis Operis</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                <Field label="Serveur SMTP" value={imap.smtp_host} onChange={v => setImap(i => ({ ...i, smtp_host: v }))} placeholder="mail.gandi.net" />
                <Field label="Port" value={imap.smtp_port} onChange={v => setImap(i => ({ ...i, smtp_port: v }))} placeholder="587" />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>Meme identifiant et mot de passe que IMAP.</div>
            </div>
          </>
        )}

        {/* SIGNATURE */}
        {tab === 'signature' && (
          <div style={card}>
            <div style={sTitle}>Signature email</div>
            <div style={sSub}>Ajoutee automatiquement a tous les emails envoyes depuis Operis</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
              {[{ key: 'fields', label: 'Champs structures' }, { key: 'html', label: 'HTML libre' }].map(m => (
                <button key={m.key} onClick={() => setSigMode(m.key as 'fields' | 'html')} style={{ padding: '5px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', border: 'none', background: sigMode === m.key ? 'var(--accent-soft)' : 'transparent', color: sigMode === m.key ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'DM Sans, system-ui' }}>{m.label}</button>
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
                {sig.name && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, marginTop: 4, marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}>Apercu</div>
                    <div dangerouslySetInnerHTML={{ __html: generatedHtml }} />
                  </div>
                )}
              </>
            ) : (
              <>
                <textarea value={sig.html} onChange={e => setSig(s => ({ ...s, html: e.target.value }))} rows={8} placeholder="<table>...</table>" style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-hi)', borderRadius: 8, padding: '10px 13px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'DM Mono, monospace', outline: 'none', resize: 'vertical', marginBottom: 14 }} />
                {sig.html && <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, marginBottom: 14 }}><div dangerouslySetInnerHTML={{ __html: sig.html }} /></div>}
              </>
            )}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>Piece jointe automatique</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input ref={fileInputRef} type="file" onChange={e => { const f = e.target.files?.[0]; if (f) { setAttachmentName(f.name); localStorage.setItem('operis_signature_attachment', f.name); show(`PJ "${f.name}" configuree`) } }} style={{ display: 'none' }} accept=".pdf,.png,.jpg,.jpeg,.html" />
                <button onClick={() => fileInputRef.current?.click()} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border-hi)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Choisir un fichier</button>
                {attachmentName && <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#4ade80' }}>{attachmentName} <button onClick={() => { setAttachmentName(''); localStorage.removeItem('operis_signature_attachment') }} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>×</button></span>}
              </div>
            </div>
            <Button variant="primary" onClick={handleSaveSig}>Sauvegarder la signature</Button>
          </div>
        )}

        {/* FAMILLE */}
        {tab === 'famille' && (
          <>
            {!org ? (
              <div style={card}>
                <div style={sTitle}>Creer votre organisation famille</div>
                <div style={sSub}>Regroupez vos boites mail sous une meme organisation pour partager les AO</div>
                <Field label="Nom de l'organisation" value={orgName} onChange={setOrgName} placeholder="Ex: Nikodex Group" />
                <Button variant="primary" loading={creatingOrg} onClick={handleCreateOrg}>Creer l'organisation</Button>
              </div>
            ) : (
              <>
                {/* Arbre organisation */}
                <div style={card}>
                  <div style={sTitle}>{org.name}</div>
                  <div style={sSub}>Arbre de votre organisation — {members.length} membre(s)</div>
                  
                  {/* Root node */}
                  <div style={{ position: 'relative', paddingLeft: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--accent-soft)', borderRadius: 10, border: '1px solid rgba(59,126,246,0.3)', marginBottom: 8 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>👑</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>contact@nikodex.fr</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>Admin — Boite principale AO</div>
                      </div>
                      <div style={{ marginLeft: 'auto', fontSize: 10, background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: 10, fontFamily: 'DM Mono, monospace' }}>ADMIN</div>
                    </div>

                    {/* Members */}
                    {members.filter((m: any) => m.role !== 'admin').map((member: any, i: number) => (
                      <div key={member.id} style={{ position: 'relative', marginLeft: 20, marginBottom: 8 }}>
                        {/* Ligne verticale */}
                        <div style={{ position: 'absolute', left: -10, top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
                        {/* Ligne horizontale */}
                        <div style={{ position: 'absolute', left: -10, top: '50%', width: 10, height: 1, background: 'var(--border)' }} />
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: member.color ?? '#3b7ef6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                            {(member.display_name ?? member.email ?? '?')[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{member.display_name ?? member.email}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>{member.email} — Membre</div>
                          </div>
                          <button onClick={() => handleRemoveMember(member.id, member.display_name ?? member.email)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.4)', cursor: 'pointer', fontSize: 16 }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#f87171'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(239,68,68,0.4)'}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inviter un membre */}
                <div style={card}>
                  <div style={sTitle}>Inviter un membre</div>
                  <div style={sSub}>Le membre doit avoir cree son compte Operis au prealable</div>
                  <Field label="Email Operis du membre *" value={inviteEmail} onChange={setInviteEmail} placeholder="membre@nikodex.fr" type="email" />
                  <Field label="Nom affiche" value={inviteName} onChange={setInviteName} placeholder="Ex: Tiana" />
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 8 }}>Couleur</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {MEMBER_COLORS.map(c => (
                        <button key={c} onClick={() => setInviteColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', border: `3px solid ${inviteColor === c ? 'white' : 'transparent'}`, background: c, cursor: 'pointer' }} />
                      ))}
                    </div>
                  </div>
                  <Button variant="primary" loading={inviting} onClick={handleInvite}>+ Inviter</Button>
                </div>
              </>
            )}
          </>
        )}

        {/* APPARENCE */}
        {tab === 'apparence' && (
          <>
            <div style={card}>
              <div style={sTitle}>Theme</div>
              <div style={sSub}>Choisissez le theme de couleur de l'interface</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                {THEMES.map(t => (
                  <button key={t.id} onClick={() => setThemeId(t.id)} style={{ padding: 0, border: `2px solid ${themeId === t.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', overflow: 'hidden', transition: 'border-color 0.12s', background: 'none' }}>
                    <div style={{ height: 52, background: t.vars['--bg-primary'], display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor }} />
                      <div style={{ width: 20, height: 2, borderRadius: 2, background: `${accentColor}60` }} />
                      <div style={{ width: 10, height: 6, borderRadius: 2, background: t.vars['--bg-card'] }} />
                    </div>
                    <div style={{ padding: '5px 8px', background: t.vars['--bg-secondary'], fontSize: 11, color: themeId === t.id ? 'var(--accent)' : t.vars['--text-muted'], fontFamily: 'DM Mono, monospace', textAlign: 'center' }}>
                      {t.label}
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}>Couleur accent</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {ACCENT_COLORS.map(color => (
                    <button key={color} onClick={() => setAccentColor(color)} style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${accentColor === color ? 'white' : 'transparent'}`, background: color, cursor: 'pointer', transition: 'border-color 0.12s' }} />
                  ))}
                  <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0 }} />
                </div>
              </div>

              <Button variant="primary" onClick={handleSaveTheme}>Appliquer le theme</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
