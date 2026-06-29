'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getAccessToken } from '@/lib/auth-client'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import {
  MAIL_UNREAD_CHANGED_EVENT,
} from '@/lib/mail-unread-events'
import NotificationPanelContent, {
  type AppNotification,
  formatBadgeCount,
} from '@/components/NotificationPanelContent'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: (a: boolean) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} width="20" height="20"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
  { href: '/tenders', label: 'AO', icon: (a: boolean) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} width="20" height="20"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
  { href: '/suppliers', label: 'Fournisseurs', icon: (a: boolean) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} width="20" height="20"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
  { href: '/mail', label: 'Messagerie', icon: (a: boolean) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} width="20" height="20"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
  { href: '/contacts', label: 'Contacts', icon: (a: boolean) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2 : 1.6} width="20" height="20"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
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
  const { session, userId } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [showAccountPanel, setShowAccountPanel] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null)
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
  const [switching, setSwitching] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [notifList, setNotifList] = useState<AppNotification[]>([])
  const notifCount = notifList.filter(n => !n.is_read).length
  const markAllLockRef = useRef(0)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const desktopNotifPanelRef = useRef<HTMLDivElement>(null)
  const mobileNotifPanelRef = useRef<HTMLDivElement>(null)
  const notifBellRef = useRef<HTMLButtonElement>(null)
  const mobileNotifBellRef = useRef<HTMLButtonElement>(null)

  // Charger l'utilisateur courant et les comptes sauvegardés
  useEffect(() => {
    if (!session) return
    const load = async () => {
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
  }, [session])

  // Badge mail : poll 60 s + mise à jour locale si count fourni (pas de Realtime)
  useEffect(() => {
    if (!userId) return

    let cancelled = false
    const POLL_MS = 60_000
    const MIN_REFETCH_MS = 10_000
    let lastFetchAt = 0
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const fetchUnread = async () => {
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return
        const res = await fetch('/api/mail/unread-count', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!cancelled && data.success) setUnreadCount(data.data?.count ?? 0)
      } catch { /* ignore */ }
    }

    const runFetchUnread = () => {
      lastFetchAt = Date.now()
      void fetchUnread()
    }

    const scheduleDebouncedFetch = () => {
      const now = Date.now()
      const elapsed = now - lastFetchAt
      if (elapsed >= MIN_REFETCH_MS) {
        if (debounceTimer) {
          clearTimeout(debounceTimer)
          debounceTimer = null
        }
        runFetchUnread()
        return
      }
      if (debounceTimer) return
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (!cancelled) runFetchUnread()
      }, MIN_REFETCH_MS - elapsed)
    }

    runFetchUnread()

    const onUnreadChanged = (e: Event) => {
      const count = (e as CustomEvent<{ count?: number }>).detail?.count
      if (typeof count === 'number') {
        setUnreadCount(count)
        return
      }
      scheduleDebouncedFetch()
    }
    window.addEventListener(MAIL_UNREAD_CHANGED_EVENT, onUnreadChanged)

    const pollIv = setInterval(() => {
      if (!cancelled) runFetchUnread()
    }, POLL_MS)

    return () => {
      cancelled = true
      if (debounceTimer) clearTimeout(debounceTimer)
      clearInterval(pollIv)
      window.removeEventListener(MAIL_UNREAD_CHANGED_EVENT, onUnreadChanged)
    }
  }, [userId])

  // Centre de notifications — poll 60 s uniquement (pas de Realtime)
  useEffect(() => {
    if (!userId) return

    let cancelled = false
    const POLL_MS = 60_000

    const fetchNotifs = async () => {
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return
        const res = await fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (cancelled || !data.success) return
        if (Date.now() < markAllLockRef.current) return
        setNotifList(data.data ?? [])
      } catch { /* ignore */ }
    }

    void fetchNotifs()

    const pollIv = setInterval(() => {
      if (!cancelled) void fetchNotifs()
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(pollIv)
    }
  }, [userId])

  // Fermer panel notifications si clic extérieur
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const target = e.target as Node
      if (desktopNotifPanelRef.current?.contains(target)) return
      if (mobileNotifPanelRef.current?.contains(target)) return
      if (notifBellRef.current?.contains(target)) return
      if (mobileNotifBellRef.current?.contains(target)) return
      if (document.getElementById('operis-mail-preview-modal')?.contains(target)) return
      setShowNotifPanel(false)
    }
    if (showNotifPanel) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showNotifPanel])

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

  const handleMarkNotifRead = async (id: string) => {
    setNotifList(prev => prev.map(x => x.id === id ? { ...x, is_read: true } : x))
    const token = await getAccessToken()
    if (!token) return
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  const handleMarkAllNotifsRead = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const token = await getAccessToken()
    if (!token) return
    setNotifList(prev => prev.map(n => ({ ...n, is_read: true })))
    markAllLockRef.current = Date.now() + 2500
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.success === false) {
      markAllLockRef.current = 0
      const token2 = await getAccessToken()
      if (token2) {
        const refresh = await fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${token2}` },
        })
        const refreshData = await refresh.json()
        if (refreshData.success) setNotifList(refreshData.data ?? [])
      }
    }
  }

  const handleRelaunchAction = async (id: string, action: 'send' | 'cancel') => {
    const token = await getAccessToken()
    if (!token) return
    await fetch('/api/notifications/relaunch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    setNotifList(prev => prev.filter(x => x.id !== id))
  }

  const AccountPanel = ({ mobile = false }: { mobile?: boolean }) => (
    <div
      ref={mobile ? undefined : panelRef}
      className={mobile ? 'mobile-sheet' : undefined}
      style={mobile ? undefined : {
        position: 'absolute', bottom: 60, left: 10,
        width: 280, background: 'var(--bg-card)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        zIndex: 200, overflow: 'hidden',
        animation: 'fadeUp 0.15s ease',
      }}
    >
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
          background: var(--bg-card); border: 1px solid var(--border-hi);
          border-radius: 8px; padding: 6px 12px;
          font-size: 12px; color: var(--text-primary); font-weight: 600;
          white-space: nowrap; pointer-events: none;
          opacity: 0; visibility: hidden;
          transition: opacity 0.2s ease, visibility 0.2s, transform 0.2s ease;
          z-index: 1000; box-shadow: var(--shadow-sm);
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .nav-item:hover .nav-tooltip { opacity: 1; visibility: visible; animation: fadeIn 0.2s ease; }
        @media (min-width: 1025px) {
          .desktop-sidebar { display: flex !important; }
          .mobile-bottom-bar { display: none !important; }
        }
        @media (max-width: 1024px) {
          .desktop-sidebar { display: none !important; }
          .mobile-bottom-bar { display: flex !important; }
        }
        .mobile-bottom-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 50;
          align-items: center;
          justify-content: space-around;
          gap: 2px;
          background: var(--bg-card);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid var(--border-hi);
          box-shadow: var(--shadow-sm);
          padding-top: 6px;
          padding-left: max(4px, env(safe-area-inset-left, 0px));
          padding-right: max(4px, env(safe-area-inset-right, 0px));
          padding-bottom: max(6px, env(safe-area-inset-bottom, 0px));
          min-height: calc(52px + env(safe-area-inset-bottom, 0px));
        }
        .mobile-nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0;
          text-decoration: none;
          padding: 6px 4px;
          border-radius: 10px;
          min-width: 36px;
          min-height: 44px;
          position: relative;
          flex: 1;
          max-width: 44px;
          -webkit-tap-highlight-color: transparent;
        }
        .mobile-nav-label { display: none; }
        @media (min-width: 1025px) {
          .mobile-only-layer { display: none !important; }
        }
      `}</style>

      {/* DESKTOP */}
      <nav className="desktop-sidebar" style={{
        width: 60, background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '16px 0', flexShrink: 0, gap: 4, position: 'relative',
      }}>
        <div style={{
          width: 38, height: 38, background: 'var(--gradient-logo)', borderRadius: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: 'white', fontFamily: 'DM Mono, monospace',
          marginBottom: 16, flexShrink: 0, boxShadow: 'var(--shadow-glow)',
        }}>OP</div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, width: '100%', alignItems: 'center' }}>
          {nav.map(item => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            const isMail = item.href === '/mail'
            return (
              <div key={item.href} className="nav-item" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <Link href={item.href} prefetch={true} data-tour={`nav-${item.href.slice(1)}`} style={{
                  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 11, textDecoration: 'none',
                  color: active ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  border: active ? '1px solid rgba(79,142,247,0.25)' : '1px solid transparent',
                  boxShadow: active ? 'var(--shadow-glow)' : 'none',
                  transition: 'all 0.15s ease', position: 'relative',
                }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  {item.icon(active)}
                  {isMail && unreadCount > 0 && (
                    <span style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, fontFamily: 'DM Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid var(--bg-card)', animation: 'pulse 1.5s ease infinite' }}>
                      {formatBadgeCount(unreadCount)}
                    </span>
                  )}
                </Link>
                <div className="nav-tooltip">{item.label}{isMail && unreadCount > 0 ? ` (${unreadCount})` : ''}</div>
              </div>
            )
          })}
        </div>

        <div style={{ width: 32, height: 1, background: 'var(--border-hi)', margin: '8px 0 12px' }} />

        {/* Notifications */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <button
            ref={notifBellRef}
            type="button"
            data-tour="nav-notifications"
            onClick={() => setShowNotifPanel(v => !v)}
            title="Notifications"
            style={{
              width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 11, background: showNotifPanel ? 'var(--accent-soft)' : 'transparent',
              border: showNotifPanel ? '1px solid rgba(79,142,247,0.25)' : '1px solid transparent',
              cursor: 'pointer', color: showNotifPanel ? 'var(--accent-cyan)' : 'var(--text-muted)', position: 'relative',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {notifCount > 0 && (
              <span style={{
                position: 'absolute', top: 8, right: 8, minWidth: 16, height: 16, borderRadius: 8,
                background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700,
                fontFamily: 'DM Mono, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', border: '2px solid var(--bg-card)', animation: 'pulse 1.5s ease infinite',
              }}>
                {formatBadgeCount(notifCount)}
              </span>
            )}
          </button>

          {showNotifPanel && (
            <div ref={desktopNotifPanelRef} style={{
              position: 'absolute', bottom: 52, left: 56, width: 320,
              background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
              borderRadius: 14, boxShadow: 'var(--shadow-md)', zIndex: 300, overflow: 'hidden',
            }}>
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Notifications</span>
                {notifCount > 0 && (
                  <button
                    type="button"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => void handleMarkAllNotifsRead(e)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}
                  >
                    Tout marquer lu
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <NotificationPanelContent
                  notifList={notifList}
                  onMarkRead={id => void handleMarkNotifRead(id)}
                  onClosePanel={() => setShowNotifPanel(false)}
                  onRelaunchAction={handleRelaunchAction}
                />
              </div>
            </div>
          )}
        </div>

        {/* Icône compte */}
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
      <nav className="mobile-bottom-bar">
        {nav.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          const isMail = item.href === '/mail'
          return (
            <Link key={item.href} href={item.href} prefetch={true} data-tour={`nav-${item.href.slice(1)}`} className="mobile-nav-item" style={{
              color: active ? 'var(--accent-cyan)' : 'var(--text-muted)',
              background: active ? 'var(--accent-soft)' : 'transparent',
            }}>
              {item.icon(active)}
              <span className="mobile-nav-label">{item.label}</span>
              {isMail && unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 2, minWidth: 14, height: 14, borderRadius: 7, background: '#ef4444', color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px' }}>
                  {formatBadgeCount(unreadCount)}
                </span>
              )}
            </Link>
          )
        })}
        {/* Notifications mobile */}
        <button
          ref={mobileNotifBellRef}
          type="button"
          className="mobile-nav-item"
          onClick={() => { setShowNotifPanel(v => !v); setShowAccountPanel(false) }}
          style={{ background: showNotifPanel ? 'var(--accent-soft)' : 'transparent', border: 'none', cursor: 'pointer', color: showNotifPanel ? 'var(--accent-cyan)' : 'var(--text-muted)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          {notifCount > 0 && (
            <span style={{ position: 'absolute', top: 4, right: 2, minWidth: 14, height: 14, borderRadius: 7, background: '#ef4444', color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px' }}>
              {formatBadgeCount(notifCount)}
            </span>
          )}
        </button>
        {/* Compte mobile */}
        <button
          type="button"
          className="mobile-nav-item"
          onClick={() => { setShowAccountPanel(v => !v); setShowNotifPanel(false) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}
        >
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', border: showAccountPanel ? '2px solid var(--accent)' : '2px solid transparent' }}>{initials}</div>
        </button>
      </nav>

      {/* Panneaux mobile (overlay) */}
      <div className="mobile-only-layer">
      {showAccountPanel && (
        <>
          <div className="mobile-panel-backdrop" onClick={() => setShowAccountPanel(false)} />
          <AccountPanel mobile />
        </>
      )}
      {showNotifPanel && (
        <>
          <div className="mobile-panel-backdrop" onClick={() => setShowNotifPanel(false)} />
          <div className="mobile-sheet" ref={mobileNotifPanelRef}>
            <div style={{
              padding: '14px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Notifications</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {notifCount > 0 && (
                  <button
                    type="button"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => void handleMarkAllNotifsRead(e)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, system-ui' }}
                  >
                    Tout marquer lu
                  </button>
                )}
                <button type="button" onClick={() => setShowNotifPanel(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: 4 }}>×</button>
              </div>
            </div>
            <div style={{ maxHeight: '60dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <NotificationPanelContent
                notifList={notifList}
                onMarkRead={id => void handleMarkNotifRead(id)}
                onClosePanel={() => setShowNotifPanel(false)}
                onRelaunchAction={handleRelaunchAction}
              />
            </div>
          </div>
        </>
      )}
      </div>
    </>
  )
}
