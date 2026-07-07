'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AuthProvider } from '@/components/AuthProvider'
import Sidebar from '@/components/Sidebar'
import PwaInstaller from '@/components/PwaInstaller'
import ProductTour from '@/components/ProductTour'
import UserJourney from '@/components/UserJourney'
import { isBillingExemptRoute, isWebsiteShellRoute } from '@/lib/public-routes'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPaywall = pathname === '/choose-plan' || pathname === '/billing/activating'
  const minimalShell = isWebsiteShellRoute(pathname) || isPaywall
  const isFillPage = pathname === '/mail' || pathname.startsWith('/mail/')

  useEffect(() => {
    document.body.classList.toggle('app-shell-mode', !minimalShell)
    return () => { document.body.classList.remove('app-shell-mode') }
  }, [minimalShell])

  return (
    <AuthProvider>
      {!minimalShell && <PwaInstaller />}
      {minimalShell ? (
        children
      ) : (
        <div className="app-shell">
          <Sidebar />
          <main className={`app-main${isFillPage ? ' app-main--fill' : ''}`}>
            <div className={`page-content${isFillPage ? ' page-content--fill' : ''}`}>
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
