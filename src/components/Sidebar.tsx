'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const nav = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} width="20" height="20">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    )
  },
  {
    href: '/tenders',
    label: "Appels d'offres",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} width="20" height="20">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    )
  },
  {
    href: '/suppliers',
    label: 'Fournisseurs',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} width="20" height="20">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    )
  },
  {
    href: '/mail',
    label: 'Messagerie',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} width="20" height="20">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
    )
  },
  {
    href: '/settings',
    label: 'Paramètres',
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} width="20" height="20">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    )
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* ── DESKTOP SIDEBAR — icônes uniquement ── */}
      <nav className="desktop-sidebar" style={{
        width: 60,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 0',
        flexShrink: 0,
        gap: 4,
      }}>
        {/* Logo */}
        <div style={{
          width: 36, height: 36,
          background: 'var(--accent)',
          borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: 'white',
          fontFamily: 'DM Mono, monospace',
          marginBottom: 16,
          flexShrink: 0,
        }}>OP</div>

        {/* Nav items */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, width: '100%', alignItems: 'center' }}>
          {nav.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href} title={item.label}
                style={{
                  width: 44, height: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 10,
                  textDecoration: 'none',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  transition: 'all 0.12s',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'
                    const tooltip = (e.currentTarget as HTMLElement).querySelector('.tooltip') as HTMLElement
                    if (tooltip) tooltip.style.opacity = '1'
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent'
                    const tooltip = (e.currentTarget as HTMLElement).querySelector('.tooltip') as HTMLElement
                    if (tooltip) tooltip.style.opacity = '0'
                  }
                }}
              >
                {item.icon(active)}
                {/* Tooltip */}
                <div className="tooltip" style={{
                  position: 'absolute', left: 52, top: '50%', transform: 'translateY(-50%)',
                  background: 'var(--bg-card)', border: '1px solid var(--border-hi)',
                  borderRadius: 7, padding: '5px 10px',
                  fontSize: 12, color: 'var(--text-primary)', fontWeight: 500,
                  whiteSpace: 'nowrap', pointerEvents: 'none',
                  opacity: 0, transition: 'opacity 0.15s',
                  zIndex: 100,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                }}>{item.label}</div>
              </Link>
            )
          })}
        </div>

        {/* Logout */}
        <button onClick={handleLogout} title="Deconnexion" style={{
          width: 44, height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 10, border: 'none', background: 'transparent',
          cursor: 'pointer', color: 'var(--text-muted)', transition: 'all 0.12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="20" height="20">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </nav>

      {/* ── MOBILE BOTTOM BAR ── */}
      <nav className="mobile-bottom-bar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 64,
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {nav.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                textDecoration: 'none', padding: '6px 12px', borderRadius: 10,
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                background: active ? 'var(--accent-soft)' : 'transparent',
                transition: 'all 0.12s', minWidth: 48,
              }}>
              {item.icon(active)}
              <span style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>
                {item.label.split(' ')[0]}
              </span>
            </Link>
          )
        })}
      </nav>

      <style>{`
        @media (min-width: 768px) {
          .desktop-sidebar { display: flex !important; }
          .mobile-bottom-bar { display: none !important; }
        }
        @media (max-width: 767px) {
          .desktop-sidebar { display: none !important; }
          .mobile-bottom-bar { display: flex !important; }
        }
      `}</style>
    </>
  )
}
