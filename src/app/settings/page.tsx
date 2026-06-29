'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { OrganizationPayload } from '@/lib/organization'
import { authFetch } from '@/lib/auth-client'
import { Button, Field, useToast, Spinner } from '@/components/ui'
import { buildFieldsSignatureHtml, saveSignatureToStorage } from '@/lib/email-signature'
import { THEMES, applyTheme, DEFAULT_THEME_ID, DEFAULT_ACCENT } from '@/lib/theme'
import { requestProductTour } from '@/lib/product-tour'
import { useAuth } from '@/components/AuthProvider'
import MailRelancesSection from '@/components/settings/MailRelancesSection'
import AoDetectionSection from '@/components/settings/AoDetectionSection'
import BillingSummarySection from '@/components/settings/BillingSummarySection'
import { cacheUserSettingsLocally } from '@/lib/user-settings'

type MailAccountRow = {
  id: string
  imap_user: string
  last_sync?: string | null
}

const ACCENT_COLORS = ['#3b7ef6', '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316']

const TABS = [
  { id: 'general',    label: 'General',    icon: '⚙' },
  { id: 'messagerie', label: 'Messagerie', icon: '✉' },
  { id: 'mail-relaunch', label: 'Messagerie & Relances', icon: '📬' },
  { id: 'ao-detection', label: 'Détection AO', icon: '📋' },
  { id: 'signature',  label: 'Signature',  icon: '✍' },
  { id: 'famille',    label: 'Famille',    icon: '👥' },
  { id: 'apparence',  label: 'Apparence',  icon: '🎨' },
  { id: 'legal',      label: 'Légal',      icon: '📜' },
]

function SettingsPageContent() {
  const searchParams = useSearchParams()
  const { session } = useAuth()
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
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID)
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT)

  const [resettingTenders, setResettingTenders] = useState(false)
  const [mailAccounts, setMailAccounts] = useState<MailAccountRow[]>([])
  const [deletingMailId, setDeletingMailId] = useState<string | null>(null)
  const [imapPassEdited, setImapPassEdited] = useState(false)

  const [org, setOrg] = useState<OrganizationPayload | null>(null)
  const [orgName, setOrgName] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [regeneratingInvite, setRegeneratingInvite] = useState(false)
  const [leavingOrg, setLeavingOrg] = useState(false)
  const [deletingOrg, setDeletingOrg] = useState(false)

  const loadOrganization = async () => {
    const res = await authFetch('/api/organization')
    const data = await res.json()
    if (data.success) setOrg(data.data ?? null)
  }

  useEffect(() => {
    const urlTab = searchParams.get('tab')
    if (urlTab && TABS.some(t => t.id === urlTab)) setTab(urlTab)
  }, [searchParams])

  const loadMailAccounts = async () => {
    const res = await authFetch('/api/mail/accounts')
    const data = await res.json()
    if (!data.success) return
    const list: MailAccountRow[] = Array.isArray(data.accounts)
      ? data.accounts
      : data.data ? [data.data] : []
    setMailAccounts(list)
    const primary = data.data ?? list[0]
    if (primary) {
      setImap(i => ({
        ...i,
        imap_host: primary.imap_host ?? 'mail.gandi.net',
        imap_port: String(primary.imap_port ?? 993),
        imap_user: primary.imap_user ?? '',
        imap_pass: '',
      }))
    } else if (session?.user?.email) {
      setImap(i => ({ ...i, imap_user: session.user.email ?? '', imap_pass: '' }))
    }
    setImapPassEdited(false)
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        await loadMailAccounts()
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
        await loadOrganization()
        const settingsRes = await authFetch('/api/user-settings')
        const settingsData = await settingsRes.json()
        if (settingsData.success) cacheUserSettingsLocally(settingsData.data)
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    load()
  }, [session?.user?.email])

  useEffect(() => {
    if (tab === 'famille') void loadOrganization()
  }, [tab])

  const handleSaveGeneral = () => {
    localStorage.setItem('operis_general', JSON.stringify(general))
    show('Sauvegardes')
  }

  const handleResetAllTenders = async () => {
    const ok = confirm(
      'Supprimer TOUS les appels d\'offres ?\n\nDevis, consultations, documents AO et liens mail seront effacés. Les emails restent dans la messagerie.\n\nAction irréversible.',
    )
    if (!ok) return
    const ok2 = confirm('Confirmer la suppression de tous les AO ?')
    if (!ok2) return
    setResettingTenders(true)
    try {
      const res = await authFetch('/api/tenders', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: 'DELETE_ALL_TENDERS' }),
      })
      const data = await res.json()
      if (data.success) {
        show(`${data.data.deleted_tenders} AO supprimé(s) — base réinitialisée`)
      } else show(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      show(`Erreur : ${err.message ?? 'réseau'}`)
    }
    setResettingTenders(false)
  }

  const mailPayload = () => ({
    imap_host: imap.imap_host,
    imap_port: parseInt(imap.imap_port),
    imap_user: imap.imap_user,
    imap_pass: imapPassEdited ? imap.imap_pass : '',
    smtp_host: imap.smtp_host,
    smtp_port: parseInt(imap.smtp_port),
    smtp_user: imap.imap_user,
    smtp_pass: imapPassEdited ? imap.imap_pass : '',
  })

  const hasStoredMailPassword = mailAccounts.some(
    a => a.imap_user.toLowerCase().trim() === imap.imap_user.toLowerCase().trim(),
  )

  const handleTest = async () => {
    if (!imapPassEdited && !hasStoredMailPassword) {
      setTestResult({ success: false, message: 'Saisissez le mot de passe mail (serveur IMAP), pas le mot de passe Operis' })
      return
    }
    setTesting(true); setTestResult(null)
    try {
      const res = await authFetch('/api/mail/accounts/test', { method: 'POST', body: JSON.stringify(mailPayload()) })
      const data = await res.json()
      setTestResult({ success: data.success, message: data.success ? `Connexion reussie — ${data.data?.count ?? 0} emails` : `Echec : ${data.error}` })
    } catch (e: any) { setTestResult({ success: false, message: `Erreur : ${e.message}` }) }
    setTesting(false)
  }

  const handleSaveImap = async () => {
    if (!imapPassEdited && !hasStoredMailPassword) {
      show('Mot de passe mail requis (mot de passe du serveur mail, pas Operis)')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch('/api/mail/accounts', { method: 'POST', body: JSON.stringify(mailPayload()) })
      const data = await res.json()
      if (data.success) {
        show(imapPassEdited ? 'Configuration sauvegardee' : 'Configuration mise a jour (mot de passe conserve)')
        await loadMailAccounts()
      } else show(`Erreur : ${data.error}`)
    } catch (e: any) { show(`Erreur : ${e.message}`) }
    setSaving(false)
  }

  const handleDeleteMailAccount = async (account: MailAccountRow) => {
    const ok = confirm(`Supprimer la boite ${account.imap_user} de ce compte Operis ?`)
    if (!ok) return
    setDeletingMailId(account.id)
    try {
      const res = await authFetch('/api/mail/accounts', {
        method: 'DELETE',
        body: JSON.stringify({ id: account.id }),
      })
      const data = await res.json()
      if (data.success) {
        show(`${account.imap_user} supprimee`)
        await loadMailAccounts()
      } else show(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      show(`Erreur : ${err.message ?? 'reseau'}`)
    }
    setDeletingMailId(null)
  }

  const handleSaveSig = () => {
    saveSignatureToStorage(sig, sigMode, accentColor)
    show('Signature sauvegardee')
  }

  const handleSignatureFile = (file: File) => {
    const isHtml = file.name.toLowerCase().endsWith('.html') || file.type === 'text/html'
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result ?? '').trim()
      if (isHtml && content) {
        const updated = { ...sig, html: content }
        setSig(updated)
        setSigMode('html')
        setAttachmentName(file.name)
        saveSignatureToStorage(updated, 'html', accentColor)
        localStorage.setItem('operis_signature_attachment', file.name)
        show('Signature HTML importée et sauvegardée')
        return
      }
      setAttachmentName(file.name)
      localStorage.setItem('operis_signature_attachment', file.name)
      show(`PJ "${file.name}" configurée (non utilisée comme signature)`)
    }
    reader.onerror = () => show('Erreur : impossible de lire le fichier')
    if (isHtml) reader.readAsText(file)
    else {
      setAttachmentName(file.name)
      localStorage.setItem('operis_signature_attachment', file.name)
      show(`PJ "${file.name}" configurée`)
    }
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
      const res = await authFetch('/api/organization', { method: 'POST', body: JSON.stringify({ name: orgName.trim() }) })
      const data = await res.json()
      if (data.success) {
        setOrg(data.data)
        show('Groupe cree — lien d\'invitation pret')
        setOrgName('')
      } else show(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      show(`Erreur : ${err.message ?? 'reseau'}`)
    }
    setCreatingOrg(false)
  }

  const handleCopyInviteLink = async () => {
    if (!org?.invite_link) return
    try {
      await navigator.clipboard.writeText(org.invite_link)
      show('Lien copie dans le presse-papiers')
    } catch {
      show('Copiez le lien manuellement')
    }
  }

  const handleRegenerateInvite = async () => {
    setRegeneratingInvite(true)
    try {
      const res = await authFetch('/api/organization', { method: 'PUT', body: JSON.stringify({ action: 'regenerate_invite' }) })
      const data = await res.json()
      if (data.success) {
        setOrg(o => o ? { ...o, invite_link: data.data.invite_link } : o)
        show('Nouveau lien genere')
      } else show(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      show(`Erreur : ${err.message ?? 'reseau'}`)
    }
    setRegeneratingInvite(false)
  }

  const handleRemoveMember = async (memberId: string, name: string) => {
    if (!confirm(`Retirer ${name} du groupe ?`)) return
    await authFetch('/api/organization', { method: 'PUT', body: JSON.stringify({ action: 'remove', member_id: memberId }) })
    await loadOrganization()
    show(`${name} retire du groupe`)
  }

  const handleLeaveOrg = async () => {
    if (!confirm('Quitter ce groupe ?')) return
    setLeavingOrg(true)
    try {
      const res = await authFetch('/api/organization', { method: 'PUT', body: JSON.stringify({ action: 'leave' }) })
      const data = await res.json()
      if (data.success) {
        setOrg(null)
        show('Groupe quitte')
      } else show(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      show(`Erreur : ${err.message ?? 'reseau'}`)
    }
    setLeavingOrg(false)
  }

  const handleDeleteOrg = async (deleteAll = false) => {
    const count = org?.owned_groups?.length ?? 1
    const msg = deleteAll && count > 1
      ? `Supprimer tous vos groupes (${count}) ? Action irreversible.`
      : `Supprimer le groupe "${org?.name}" ? Tous les membres seront retires.`
    if (!confirm(msg)) return
    setDeletingOrg(true)
    try {
      const res = await authFetch('/api/organization', {
        method: 'PUT',
        body: JSON.stringify({
          action: 'delete_group',
          organization_id: deleteAll ? undefined : org?.id,
          delete_all: deleteAll,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setOrg(null)
        show(`Groupe(s) supprime(s) : ${data.data?.name ?? org?.name}`)
        await loadOrganization()
      } else show(`Erreur : ${data.error}`)
    } catch (e: unknown) {
      const err = e as { message?: string }
      show(`Erreur : ${err.message ?? 'reseau'}`)
    }
    setDeletingOrg(false)
  }

  const generatedHtml = buildFieldsSignatureHtml(sig, accentColor)

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
          <button key={t.id} data-tour={t.id === 'messagerie' ? 'settings-messagerie' : undefined} onClick={() => setTab(t.id)} style={{
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

      <BillingSummarySection />

      <div style={{ maxWidth: 660 }}>

        {/* GENERAL */}
        {tab === 'general' && (
          <div style={card}>
            <div style={sTitle}>Informations generales</div>
            <div style={sSub}>Parametres de base de votre compte Operis</div>
            <Field label="Nom de la societe" value={general.companyName} onChange={v => setGeneral(g => ({ ...g, companyName: v }))} placeholder="Ex: Nikodex" />
            <Field label="Votre nom" value={general.userName} onChange={v => setGeneral(g => ({ ...g, userName: v }))} placeholder="Ex: Uros Baralic" />
            <Button variant="primary" onClick={handleSaveGeneral}>Sauvegarder</Button>
            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                onClick={() => {
                  void authFetch('/api/profile', {
                    method: 'PATCH',
                    body: JSON.stringify({ tour_done: false }),
                  })
                  requestProductTour()
                  setTab('general')
                }}
                style={{
                  background: 'var(--accent-soft)', border: '1px solid rgba(79,142,247,0.25)',
                  borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--accent)',
                  cursor: 'pointer', fontFamily: 'DM Sans, system-ui', fontWeight: 600,
                }}
              >
                Revoir le guide interactif Operis
              </button>
            </div>
            <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              <div style={sTitle}>Réinitialiser les appels d&apos;offres</div>
              <div style={sSub}>
                Supprime tous les AO, devis, consultations et documents. Délie les emails de la messagerie. Les fournisseurs et les emails ne sont pas supprimés.
              </div>
              <Button variant="ghost" loading={resettingTenders} onClick={handleResetAllTenders}
                style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.35)' }}>
                Supprimer tous les AO
              </Button>
            </div>
          </div>
        )}

        {/* MESSAGERIE */}
        {tab === 'messagerie' && (
          <>
            {mailAccounts.length > 0 && (
              <div style={card}>
                <div style={sTitle}>Boites connectees</div>
                <div style={sSub}>
                  Un seul IMAP = votre email Operis ({session?.user?.email ?? 'login'}). Supprimez les boites en trop avant de tester.
                </div>
                {mailAccounts.map(account => {
                  const isOwn = account.imap_user?.toLowerCase() === session?.user?.email?.toLowerCase()
                  return (
                    <div
                      key={account.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                        marginBottom: 8, borderRadius: 8,
                        border: `1px solid ${isOwn ? 'rgba(59,126,246,0.35)' : 'var(--border)'}`,
                        background: isOwn ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'DM Mono, monospace' }}>{account.imap_user}</div>
                        {account.last_sync && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                            Sync : {new Date(account.last_sync).toLocaleString('fr-FR')}
                          </div>
                        )}
                      </div>
                      {isOwn && (
                        <span style={{ fontSize: 9, background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: 10, fontFamily: 'DM Mono, monospace' }}>
                          ACTIF
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteMailAccount(account)}
                        disabled={deletingMailId === account.id}
                        style={{
                          background: 'none', border: '1px solid rgba(248,113,113,0.35)',
                          color: '#f87171', borderRadius: 6, padding: '5px 10px', fontSize: 11,
                          cursor: deletingMailId === account.id ? 'wait' : 'pointer', fontFamily: 'DM Sans, system-ui',
                        }}
                      >
                        {deletingMailId === account.id ? '...' : 'Supprimer'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <form autoComplete="off" onSubmit={e => e.preventDefault()}>
            <div style={card}>
              <div style={sTitle}>Serveur IMAP</div>
              <div style={sSub}>Connexion pour lire et importer tes emails</div>
              <div style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 14,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                fontSize: 12, color: '#fbbf24', lineHeight: 1.5,
              }}>
                Le mot de passe mail (Gandi, etc.) est different du mot de passe Operis.
                Si Google remplit le champ automatiquement, effacez-le et saisissez le mot de passe du serveur mail.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                <Field label="Serveur IMAP" value={imap.imap_host} onChange={v => setImap(i => ({ ...i, imap_host: v }))} placeholder="mail.gandi.net" autoComplete="off" />
                <Field label="Port" value={imap.imap_port} onChange={v => setImap(i => ({ ...i, imap_port: v }))} placeholder="993" autoComplete="off" />
              </div>
              <Field
                label="Email *"
                value={imap.imap_user}
                onChange={v => setImap(i => ({ ...i, imap_user: v }))}
                placeholder="ton@email.com"
                type="email"
                name="operis-imap-user"
                inputId="operis-imap-user"
                autoComplete="off"
                preventAutofill
              />
              <Field
                label={hasStoredMailPassword ? 'Mot de passe mail' : 'Mot de passe mail *'}
                value={imap.imap_pass}
                onChange={v => {
                  setImapPassEdited(true)
                  setImap(i => ({ ...i, imap_pass: v }))
                }}
                placeholder={hasStoredMailPassword ? 'Laisser vide pour garder le mot de passe enregistre' : 'Mot de passe du serveur mail'}
                type="password"
                name="operis-imap-app-password"
                inputId="operis-imap-app-password"
                autoComplete="new-password"
                preventAutofill
              />
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
            </form>
          </>
        )}

        {tab === 'mail-relaunch' && (
          <MailRelancesSection
            onSaved={() => show('✓ Paramètres enregistrés')}
            onError={msg => show(`Erreur : ${msg}`)}
          />
        )}

        {tab === 'ao-detection' && (
          <AoDetectionSection
            onSaved={() => show('✓ Paramètres enregistrés')}
            onError={msg => show(`Erreur : ${msg}`)}
          />
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
                <input ref={fileInputRef} type="file" onChange={e => { const f = e.target.files?.[0]; if (f) handleSignatureFile(f); e.target.value = '' }} style={{ display: 'none' }} accept=".html,.htm,text/html,.pdf,.png,.jpg,.jpeg" />
                <button onClick={() => fileInputRef.current?.click()} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border-hi)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}>Choisir un fichier</button>
                {attachmentName && <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#4ade80' }}>{attachmentName} <button onClick={() => { setAttachmentName(''); localStorage.removeItem('operis_signature_attachment') }} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>×</button></span>}
              </div>
            </div>
            <Button variant="primary" onClick={handleSaveSig}>Sauvegarder la signature</Button>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace', marginBottom: 10 }}>
                Aperçu en direct
              </div>
              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border-hi)', padding: 16, minHeight: 80 }}>
                {sigMode === 'fields' ? (
                  generatedHtml ? <div dangerouslySetInnerHTML={{ __html: generatedHtml }} /> : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Remplissez les champs pour voir l&apos;aperçu</span>
                ) : (
                  sig.html ? <div dangerouslySetInnerHTML={{ __html: sig.html }} /> : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Collez votre HTML signature</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FAMILLE */}
        {tab === 'famille' && (
          <>
            {!org ? (
              <div style={card}>
                <div style={sTitle}>Creer votre groupe (AO)</div>
                <div style={sSub}>
                  Regroupez vos comptes Operis pour les appels d&apos;offres. Chaque compte garde sa messagerie personnelle.
                </div>
                <Field label="Nom du groupe" value={orgName} onChange={setOrgName} placeholder="Ex: Nikodex Group" />
                <Button variant="primary" loading={creatingOrg} onClick={handleCreateOrg}>Creer le groupe</Button>
              </div>
            ) : (
              <>
                <div style={card}>
                  <div style={sTitle}>{org.name}</div>
                  <div style={sSub}>
                    {org.is_owner
                      ? 'Vous etes le createur (membre n°1). Invitez l\'equipe pour collaborer sur les AO.'
                      : `Membre n°${org.my_number ?? '?'} — createur : ${org.owner_email ?? 'inconnu'}`}
                  </div>
                  {org.is_owner && session?.user?.email && org.owner_email
                    && session.user.email.toLowerCase() !== org.owner_email.toLowerCase() && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                      background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                      fontSize: 12, color: '#fbbf24',
                    }}>
                      Ce groupe semble lie a un autre compte ({org.owner_email}). Supprimez-le si vous voulez rejoindre le groupe de contact@ via le lien d&apos;invitation.
                    </div>
                  )}
                  {org.members.map(member => {
                    const isCreator = member.user_id === org.owner_id
                    const label = member.display_name?.trim() || member.email || 'Membre'
                    return (
                      <div
                        key={member.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                          marginBottom: 8, borderRadius: 10,
                          border: `1px solid ${isCreator ? 'rgba(59,126,246,0.35)' : 'var(--border)'}`,
                          background: isCreator ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                        }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: member.color ?? '#3b7ef6', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, fontFamily: 'DM Mono, monospace',
                        }}>
                          {member.number}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                            {member.email}
                            {isCreator ? ' — Createur' : ' — Membre'}
                          </div>
                        </div>
                        {org.is_owner && !isCreator && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id, label)}
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 18 }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div style={card}>
                  {org.is_owner ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {org.owned_groups && org.owned_groups.length > 1 && (
                        <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 4 }}>
                          Vous avez {org.owned_groups.length} groupes crees : {org.owned_groups.map(g => g.name).join(', ')}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        loading={deletingOrg}
                        onClick={() => handleDeleteOrg(false)}
                        style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.35)' }}
                      >
                        Supprimer ce groupe
                      </Button>
                      {org.owned_groups && org.owned_groups.length > 1 && (
                        <Button
                          variant="ghost"
                          loading={deletingOrg}
                          onClick={() => handleDeleteOrg(true)}
                          style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.35)' }}
                        >
                          Supprimer tous mes groupes ({org.owned_groups.length})
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <Button
                        variant="ghost"
                        loading={leavingOrg}
                        onClick={handleLeaveOrg}
                        style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.35)' }}
                      >
                        Quitter ce groupe
                      </Button>
                      {org.owned_groups && org.owned_groups.length > 0 && (
                        <Button
                          variant="ghost"
                          loading={deletingOrg}
                          onClick={() => handleDeleteOrg(true)}
                          style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.35)' }}
                        >
                          Supprimer mes groupes crees ({org.owned_groups.length})
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {org.is_owner && org.invite_link && (
                  <div style={card}>
                    <div style={sTitle}>Lien d&apos;invitation</div>
                    <div style={sSub}>
                      Envoyez ce lien au compte Operis a inviter. Il se connecte, confirme, et devient membre n°{org.members.length + 1}.
                    </div>
                    <div style={{
                      padding: '10px 12px', borderRadius: 8, marginBottom: 14,
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                      fontSize: 11, fontFamily: 'DM Mono, monospace', color: 'var(--text-secondary)',
                      wordBreak: 'break-all',
                    }}>
                      {org.invite_link}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button variant="primary" onClick={handleCopyInviteLink}>Copier le lien</Button>
                      <Button variant="ghost" loading={regeneratingInvite} onClick={handleRegenerateInvite}>
                        Nouveau lien
                      </Button>
                    </div>
                  </div>
                )}
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

        {tab === 'legal' && (
          <div style={card}>
            <div style={sTitle}>Documents légaux</div>
            <div style={sSub}>Consultez les conditions d&apos;utilisation et la politique de confidentialité Operis.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <a href="/legal#cgu" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                Conditions Générales d&apos;Utilisation (CGU) →
              </a>
              <a href="/legal#cgv" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                Conditions Générales de Vente (CGV) →
              </a>
              <a href="/legal#confidentialite" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                Politique de confidentialité (RGPD) →
              </a>
              <a href="/legal#mentions" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>
                Mentions légales →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>}>
      <SettingsPageContent />
    </Suspense>
  )
}
