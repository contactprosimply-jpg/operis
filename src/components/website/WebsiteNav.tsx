'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabase'
import { clearAuthSessionStore } from '@/lib/auth-session-store'
import { OperisLogoMark } from '@/components/OperisLogoMark'

function Logo({ size = 36 }: { size?: number }) {
  return <OperisLogoMark size={size} />
}

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active?: boolean }) {
  return (
    <Link href={href} style={{
      fontSize: 13, fontWeight: active ? 600 : 500,
      color: active ? '#021246' : 'var(--text-secondary)',
      textDecoration: 'none',
    }}>
      {children}
    </Link>
  )
}

function BtnOutline({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
      border: '1px solid var(--border-hi)', color: 'var(--text-secondary)',
      textDecoration: 'none', fontFamily: 'DM Sans, system-ui',
    }}>
      {children}
    </Link>
  )
}

function BtnPrimary({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
      background: '#021246', color: '#fff', textDecoration: 'none',
      fontFamily: 'DM Sans, system-ui',
    }}>
      {children}
    </Link>
  )
}

export default function WebsiteNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { session } = useAuth()

  const logout = async () => {
    clearAuthSessionStore()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(248,250,252,0.92)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
          <Logo />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#021246' }}>Operis</span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <NavLink href="/pricing" active={pathname === '/pricing'}>Tarifs</NavLink>
          {session ? (
            <>
              <NavLink href="/compte" active={pathname === '/compte'}>Mon compte</NavLink>
              <NavLink href="/telechargement" active={pathname === '/telechargement'}>Téléchargement</NavLink>
              <button type="button" onClick={() => void logout()} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: 'var(--text-muted)', fontFamily: 'DM Sans, system-ui',
              }}>
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <BtnOutline href="/login">Se connecter</BtnOutline>
              <BtnPrimary href="/signup">Créer un compte</BtnPrimary>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
