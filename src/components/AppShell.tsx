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
        <div className="app-shell">
          <Sidebar />
          <main className="app-main">
            <div className="page-content">
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
