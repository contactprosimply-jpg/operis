'use client'

import { usePathname } from 'next/navigation'
import { AuthProvider } from '@/components/AuthProvider'
import Sidebar from '@/components/Sidebar'
import PwaInstaller from '@/components/PwaInstaller'
import ProductTour from '@/components/ProductTour'
import UserJourney from '@/components/UserJourney'
import { isBillingExemptRoute, isPublicRoute } from '@/lib/public-routes'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = isPublicRoute(pathname)
  const isPaywall = pathname === '/choose-plan' || pathname === '/billing/activating'
  const minimalShell = isPublic || isPaywall

  return (
    <AuthProvider>
      <PwaInstaller />
      {minimalShell ? (
        children
      ) : (
        <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
          <Sidebar />
          <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-secondary)', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="page-content" style={{ flex: 1 }}>
              {children}
            </div>
          </main>
          {!isBillingExemptRoute(pathname) && <UserJourney />}
          {!isBillingExemptRoute(pathname) && <ProductTour />}
        </div>
      )}
    </AuthProvider>
  )
}
