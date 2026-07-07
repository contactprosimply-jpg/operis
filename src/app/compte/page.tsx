'use client'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authFetch } from '@/lib/auth-client'
import { supabase } from '@/lib/supabase'
import { clearAuthSessionStore } from '@/lib/auth-session-store'
import WebsiteLayout from '@/components/website/WebsiteLayout'
import SimplyGreenTab from '@/components/compte/SimplyGreenTab'
import { Spinner, useToast } from '@/components/ui'
import type { OrganizationPayload } from '@/lib/organization'
import type { BillingPlan } from '@/lib/billing/plan-limits'

type AccountData = {
  profile: {
    id: string
    full_name: string | null
    company: string | null
    role: string | null
    created_at: string | null
  }
  email: string | null
  created_at: string | null
  organization: OrganizationPayload | null
  billing: {
    has_access: boolean
    plan: BillingPlan | null
    status: string | null
    current_period_end: string | null
    subscription_created_at: string | null
    is_owner: boolean
    is_billing_admin: boolean
    limits: { seats: number; storageGb: number }
    usage: { seats: number; storage_gb: number }
  }
}

function splitName(fullName: string | null): { first: string; last: string } {
  if (!fullName?.trim()) return { first: '', last: '' }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function planLabel(plan: BillingPlan | null, isBillingAdmin: boolean): string {
  if (isBillingAdmin) return 'Early adopter'
  if (plan === 'business') return 'Business'
  if (plan === 'pro') return 'Pro'
  return 'Aucun abonnement actif'
}

function statusLabel(status: string | null): string {
  if (!status) return '—'
  const map: Record<string, string> = {
    active: 'Actif',
    past_due: 'Paiement en retard',
    inactive: 'Inactif',
    canceled: 'Annulé',
    trialing: 'Essai',
  }
  return map[status] ?? status
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '20px 22px', marginBottom: 16,
    }}>
      <h2 style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase',
        letterSpacing: '0.08em', fontFamily: 'DM Mono, monospace', margin: '0 0 16px',
      }}>{title}</h2>
      {children}
    </section>
  )
}

const COMPTE_TABS = [
  { id: 'profil', label: 'Profil', icon: '👤' },
  { id: 'simply-green', label: 'Simply Green', icon: '🌿' },
] as const

type CompteTabId = typeof COMPTE_TABS[number]['id']

function ComptePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: CompteTabId = COMPTE_TABS.some(t => t.id === tabParam) ? (tabParam as CompteTabId) : 'profil'
  const { show, ToastComponent } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [account, setAccount] = useState<AccountData | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/account')
      const json = await res.json()
      if (!json.success) {
        show(json.error ?? 'Erreur chargement compte')
        return
      }
      const data = json.data as AccountData
      setAccount(data)
      const { first, last } = splitName(data.profile.full_name)
      setFirstName(first)
      setLastName(last)
      setCompanyName(data.profile.company ?? '')
      setOrgName(data.organization?.name ?? '')
    } catch {
      show('Erreur chargement compte')
    } finally {
      setLoading(false)
    }
  }, [show])

  useEffect(() => { void load() }, [load])

  const initials = useMemo(() => {
    const a = firstName.trim()[0] ?? ''
    const b = lastName.trim()[0] ?? account?.email?.[0] ?? '?'
    return (a + b).toUpperCase() || '?'
  }, [firstName, lastName, account?.email])

  const saveProfile = async () => {
    if (!account) return
    setSaving(true)
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
    try {
      const profileRes = await authFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: fullName || null, company: companyName.trim() || null }),
      })
      const profileJson = await profileRes.json()
      if (!profileJson.success) {
        show(profileJson.error ?? 'Erreur profil')
        setSaving(false)
        return
      }

      if (account.organization?.is_owner && orgName.trim() && orgName.trim() !== account.organization.name) {
        const orgRes = await authFetch('/api/organization', {
          method: 'PUT',
          body: JSON.stringify({ action: 'rename', name: orgName.trim() }),
        })
        const orgJson = await orgRes.json()
        if (!orgJson.success) {
          show(orgJson.error ?? 'Erreur organisation')
          setSaving(false)
          return
        }
      }

      show('Profil mis à jour')
      await load()
    } catch {
      show('Erreur sauvegarde')
    }
    setSaving(false)
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setChangingPassword(true)
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      const json = await res.json()
      if (!json.success) {
        show(json.error ?? 'Erreur mot de passe')
        setChangingPassword(false)
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      show('Mot de passe modifié')
    } catch {
      show('Erreur mot de passe')
    }
    setChangingPassword(false)
  }

  const openBillingPortal = async () => {
    setPortalLoading(true)
    try {
      const res = await authFetch('/api/billing/portal', { method: 'POST' })
      const json = await res.json()
      if (json.success && json.url) {
        window.location.href = json.url
        return
      }
      show(json.error ?? 'Portail indisponible — souscrivez une offre d\'abord')
    } catch {
      show('Erreur portail Stripe')
    }
    setPortalLoading(false)
  }

  const logout = async () => {
    clearAuthSessionStore()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)',
    fontFamily: 'DM Sans, system-ui', boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6,
  }

  if (loading) {
    return (
      <WebsiteLayout>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spinner size={28} />
        </div>
      </WebsiteLayout>
    )
  }

  if (!account) {
    return (
      <WebsiteLayout>
        <div style={{ color: 'var(--text-muted)' }}>Impossible de charger le compte.</div>
      </WebsiteLayout>
    )
  }

  const createdLabel = account.created_at
    ? new Date(account.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  const periodEnd = account.billing.current_period_end
    ? new Date(account.billing.current_period_end).toLocaleDateString('fr-FR')
    : '—'

  const setTab = (id: CompteTabId) => {
    const url = id === 'profil' ? '/compte' : `/compte?tab=${id}`
    router.push(url)
  }

  return (
    <WebsiteLayout>
    <div style={{ maxWidth: 720 }}>
      {ToastComponent}
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
          fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none',
        }}>
          ← Retour à mon espace
        </Link>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace' }}>
            Mon compte
          </span>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: '8px 0 4px' }}>Profil & abonnement</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Gérez vos informations, votre organisation et votre abonnement.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {COMPTE_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#16a34a' : 'var(--text-muted)',
              borderBottom: tab === t.id ? '2px solid #16a34a' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.12s', fontFamily: 'DM Sans, system-ui',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'simply-green' ? (
        <SimplyGreenTab
          hasActiveSubscription={account.billing.has_access}
          subscriptionCreatedAt={account.billing.subscription_created_at}
          companyName={account.profile.company ?? companyName}
        />
      ) : (
      <>
      <Section title="Identité">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: '#021246', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 18, flexShrink: 0,
          }}>{initials}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{account.profile.full_name ?? account.email}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{account.email}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'DM Mono, monospace' }}>
              Membre depuis {createdLabel}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Prénom</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Nom</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email</label>
          <input value={account.email ?? ''} disabled style={{ ...inputStyle, opacity: 0.7 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Entreprise (profil)</label>
          <input value={companyName} onChange={e => setCompanyName(e.target.value)} style={inputStyle} />
        </div>
        <button type="button" onClick={() => void saveProfile()} disabled={saving} style={{
          background: '#021246', color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          {saving && <Spinner size={14} />}
          Enregistrer
        </button>
      </Section>

      <Section title="Organisation">
        {account.organization ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Nom du groupe</label>
              <input
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                disabled={!account.organization.is_owner}
                style={{ ...inputStyle, opacity: account.organization.is_owner ? 1 : 0.7 }}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Rôle : <strong>{account.organization.is_owner ? 'Administrateur' : 'Membre'}</strong>
            </div>
            {account.organization.is_owner && account.organization.members.length > 0 && (
              <div>
                <div style={labelStyle}>Membres ({account.organization.members.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {account.organization.members.map(m => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12,
                    }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: 8, background: m.color ?? '#021246',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700,
                      }}>{(m.display_name ?? m.email ?? '?').slice(0, 2).toUpperCase()}</span>
                      <span style={{ flex: 1 }}>{m.display_name ?? m.email ?? 'Membre'}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>{m.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Link href="/settings?tab=famille" style={{ display: 'inline-block', marginTop: 12, fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
              Gérer la famille →
            </Link>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Aucune organisation. <Link href="/settings?tab=famille" style={{ color: 'var(--text-primary)' }}>Créer un groupe</Link>
          </p>
        )}
      </Section>

      <Section title="Abonnement">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={labelStyle}>Plan</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {planLabel(account.billing.plan, account.billing.is_billing_admin)}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Statut</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{statusLabel(account.billing.status)}</div>
          </div>
          <div>
            <div style={labelStyle}>Prochaine échéance</div>
            <div style={{ fontSize: 14 }}>{periodEnd}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: 13 }}>
          <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <div style={labelStyle}>Utilisateurs</div>
            {account.billing.usage.seats} / {account.billing.limits.seats || '—'}
          </div>
          <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <div style={labelStyle}>Stockage</div>
            {account.billing.usage.storage_gb} Go / {account.billing.limits.storageGb || '—'} Go
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {account.billing.is_owner && (
            <button type="button" onClick={() => void openBillingPortal()} disabled={portalLoading} style={{
              background: '#021246', color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: portalLoading ? 'wait' : 'pointer',
            }}>
              {portalLoading ? 'Ouverture…' : 'Gérer mon abonnement'}
            </button>
          )}
          {!account.billing.has_access && (
            <Link href="/choose-plan" style={{
              background: 'rgba(2,18,70,0.08)', color: 'var(--text-primary)', border: '1px solid rgba(2,18,70,0.2)',
              borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              Choisir une offre
            </Link>
          )}
          {account.billing.has_access && (
            <Link href="/telechargement" style={{
              background: 'rgba(2,18,70,0.08)', color: 'var(--text-primary)', border: '1px solid rgba(2,18,70,0.2)',
              borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              Télécharger l&apos;application →
            </Link>
          )}
        </div>
      </Section>

      <Section title="Sécurité">
        <form onSubmit={changePassword}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Mot de passe actuel</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Nouveau mot de passe</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} style={inputStyle} />
          </div>
          <button type="submit" disabled={changingPassword} style={{
            background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600,
            cursor: changingPassword ? 'wait' : 'pointer', marginRight: 10,
          }}>
            {changingPassword ? 'Modification…' : 'Changer le mot de passe'}
          </button>
          <button type="button" onClick={() => void logout()} style={{
            background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Se déconnecter
          </button>
        </form>
      </Section>
      </>
      )}
    </div>
    </WebsiteLayout>
  )
}

export default function ComptePage() {
  return (
    <Suspense fallback={
      <WebsiteLayout>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spinner size={28} />
        </div>
      </WebsiteLayout>
    }>
      <ComptePageContent />
    </Suspense>
  )
}
