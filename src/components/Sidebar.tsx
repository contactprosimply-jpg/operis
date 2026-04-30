'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useState, useEffect, useRef } from 'react'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: (a: boolean) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} width="20" height="20"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
  { href: '/tenders', label: 'AO', icon: (a: boolean) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} width="20" height="20"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { href: '/suppliers', label: 'Fournisseurs', icon: (a: boolean) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} width="20" height="20"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
  { href: '/mail', label: 'Messagerie', icon: (a: boolean) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} width="20" height="20"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
  { href: '/settings', label: 'Parametres', icon: (a: boolean) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
]

// Stockage local des comptes connectés (style Gmail)
const ACCOUNTS_KEY = 'operis_accounts'

interface SavedAccount {
  email: string
  name: string
  initials: string
  color: string
  token?: string
}

function getInitials(name: string, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function getAvatarColor(email: string): string {
  const colors = ['#3b7ef6', '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#f97316']
  let hash = 0
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) % colors.length
  return colors[Math.abs(hash)]
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState(0)
  const [showAccountPanel, setShowAccountPanel] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null)
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
  const [switching, setSwitching] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Charger l'utilisateur courant et les comptes sauvegardés
  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const email = session.user.email ?? ''
      const name = session.user.user_metadata?.full_name ?? ''
      setCurrentUser({ email, name })

      // Sauvegarder le compte courant dans la liste
      const stored = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '[]') as SavedAccount[]
      const exists = stored.find(a => a.email === email)
      if (!exists) {
        const newAccount: SavedAccount = {
          email,
          name,
          initials: getInitials(name, email),
          color: getAvatarColor(email),
        }
        const updated = [newAccount, ...stored.filter(a => a.email !== email)]
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated))
        setSavedAccounts(updated)
      } else {
        setSavedAccounts(stored)
      }
    }
    load()
  }, [])

  // Compter les emails non lus toutes les 60 secondes
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/mail/emails?unread=true', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const data = await res.json()
        if (data.success) setUnreadCount(data.data.length)
      } catch {}
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 60000)
    return () => clearInterval(interval)
  }, [])

  // Fermer le panel si clic à l'extérieur
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowAccountPanel(false)
      }
    }
    if (showAccountPanel) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showAccountPanel])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setShowAccountPanel(false)
    router.push('/login')
  }

  const handleSwitchAccount = async (account: SavedAccount) => {
    setSwitching(account.email)
    // Pour switcher : déconnecter et aller sur login avec l'email pré-rempli
    await supabase.auth.signOut()
    setShowAccountPanel(false)
    router.push(`/login?email=${encodeURIComponent(account.email)}`)
  }

  const handleAddAccount = async () => {
    await supabase.auth.signOut()
    setShowAccountPanel(false)
    router.push('/login')
  }

  const handleRemoveAccount = (email: string) => {
    const stored = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '[]') as SavedAccount[]
    const updated = stored.filter(a => a.email !== email)
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated))
    setSavedAccounts(updated)
  }

  const initials = currentUser ? getInitials(currentUser.name, currentUser.email) : 'OP'
  const avatarColor = currentUser ? getAvatarColor(currentUser.email) : '#3b7ef6'

  const AccountPanel = () => (
    <div ref={panelRef} style={{
      position: 'absolute', bottom: 60, left: 10,
      width: 280, background: '#1e2130',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      zIndex: 200, overflow: 'hidden',
      animation: 'fadeUp 0.15s ease',
    }}>
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>

      {/* Header compte actif */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#4a5168', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Compte actif</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {currentUser?.name && <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f3f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>}
            <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#8b92a5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser?.email}</div>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        </div>
      </div>

      {/* Autres comptes */}
      {savedAccounts.filter(a => a.email !== currentUser?.email).length > 0 && (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#4a5168', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 16px 4px' }}>Autres comptes</div>
          {savedAccounts.filter(a => a.email !== currentUser?.email).map(account => (
            <div key={account.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              onClick={() => handleSwitchAccount(account)}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: account.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {switching === account.email ? '...' : account.initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {account.name && <div style={{ fontSize: 12, fontWeight: 500, color: '#f1f3f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</div>}
                <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#8b92a5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.email}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); handleRemoveAccount(account.email) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5168', fontSize: 16, lineHeight: 1, padding: 2 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#f87171'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#4a5168'}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '8px 0' }}>
        <button onClick={handleAddAccount} style={{ width: '100%', padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#8b92a5', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s', fontFamily: 'DM Sans, system-ui' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Ajouter un compte
        </button>
        <button onClick={handleLogout} style={{ width: '100%', padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#f87171', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s', fontFamily: 'DM Sans, system-ui' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Se déconnecter
        </button>
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        .nav-item { position: relative; }
        .nav-tooltip {
          position: absolute; left: 56px; top: 50%; transform: translateY(-50%);
          background: #1e2130; border: 1px solid rgba(255,255,255,0.12);
          border-radius: 7px; padding: 5px 10px;
          font-size: 12px; color: #f1f3f9; font-weight: 500;
          white-space: nowrap; pointer-events: none;
          opacity: 0; visibility: hidden;
          transition: opacity 0.15s, visibility 0.15s;
          z-index: 1000; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .nav-item:hover .nav-tooltip { opacity: 1; visibility: visible; }
        @media (min-width: 768px) { .desktop-sidebar { display: flex !important; } .mobile-bottom-bar { display: none !important; } }
        @media (max-width: 767px) { .desktop-sidebar { display: none !important; } .mobile-bottom-bar { display: flex !important; } }
      `}</style>

      {/* DESKTOP */}
      <nav className="desktop-sidebar" style={{ width: 60, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', flexShrink: 0, gap: 4, position: 'relative' }}>
        <div style={{ width: 36, height: 36, background: 'var(--accent)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', fontFamily: 'DM Mono, monospace', marginBottom: 16, flexShrink: 0 }}>OP</div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, width: '100%', alignItems: 'center' }}>
          {nav.map(item => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            const isMail = item.href === '/mail'
            return (
              <div key={item.href} className="nav-item" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <Link href={item.href} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, textDecoration: 'none', color: active ? 'var(--accent)' : 'var(--text-muted)', background: active ? 'var(--accent-soft)' : 'transparent', transition: 'all 0.12s', position: 'relative' }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  {item.icon(active)}
                  {isMail && unreadCount > 0 && (
                    <span style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, fontFamily: 'DM Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid var(--bg-secondary)' }}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
                <div className="nav-tooltip">{item.label}{isMail && unreadCount > 0 ? ` (${unreadCount})` : ''}</div>
              </div>
            )
          })}
        </div>

        {/* Icône compte - remplace le bouton déconnexion */}
        <div style={{ position: 'relative' }}>
          {showAccountPanel && <AccountPanel />}
          <button
            onClick={() => setShowAccountPanel(v => !v)}
            title={currentUser?.email ?? 'Compte'}
            style={{ width: 36, height: 36, borderRadius: '50%', background: avatarColor, border: showAccountPanel ? `2px solid var(--accent)` : '2px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'DM Mono, monospace', transition: 'all 0.15s', boxShadow: showAccountPanel ? `0 0 0 3px rgba(59,126,246,0.3)` : 'none' }}>
            {initials}
          </button>
        </div>
      </nav>

      {/* MOBILE */}
      <nav className="mobile-bottom-bar" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 64, background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 50 }}>
        {nav.map(item => {
          const active = pathname.startsWith(item.href)
          const isMail = item.href === '/mail'
          return (
            <Link key={item.href} href={item.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none', padding: '6px 10px', borderRadius: 10, color: active ? 'var(--accent)' : 'var(--text-muted)', background: active ? 'var(--accent-soft)' : 'transparent', minWidth: 44, position: 'relative' }}>
              {item.icon(active)}
              {isMail && unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14, borderRadius: 7, background: '#ef4444', color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
              <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>{item.label.slice(0, 6)}</span>
            </Link>
          )
        })}
        {/* Icône compte mobile */}
        <button onClick={() => setShowAccountPanel(v => !v)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{initials}</div>
          <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', color: 'var(--text-muted)' }}>Compte</span>
        </button>
      </nav>
    </>
  )
}
/ /   v 7  
 