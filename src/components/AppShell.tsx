'use client'

import { usePathname } from 'next/navigation'
import { AuthProvider } from '@/components/AuthProvider'
import Sidebar from '@/components/Sidebar'
import PwaInstaller from '@/components/PwaInstaller'
import ProductTour from '@/components/ProductTour'
import UserJourney from '@/components/UserJourney'

const PUBLIC_ROUTES = ['/', '/login', '/register']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = PUBLIC_ROUTES.includes(pathname) || pathname.startsWith('/join/')

  return (
    <AuthProvider>
      <PwaInstaller />
      {isPublic ? (
        children
      ) : (
        <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
          <Sidebar />
          <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-secondary)', minWidth: 0 }}>
            <div className="page-content">
              {children}
            </div>
          </main>
          <UserJourney />
          <ProductTour />
        </div>
      )}
    </AuthProvider>
  )
}
