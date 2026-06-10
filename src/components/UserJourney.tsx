'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/auth-client'
import Onboarding from '@/components/Onboarding'
import { requestProductTour } from '@/lib/product-tour'

/**
 * Parcours nouveau utilisateur Operis :
 * 1. Onboarding 3 étapes (mail, fournisseurs, premier AO)
 * 2. Guide interactif spotlight (ProductTour)
 */
export default function UserJourney() {
  const { ready, accessToken } = useAuth()
  const [checked, setChecked] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (!ready || !accessToken) return

    const check = async () => {
      try {
        const [profileRes, mailRes, suppliersRes, tendersRes] = await Promise.all([
          authFetch('/api/profile'),
          authFetch('/api/mail/accounts'),
          authFetch('/api/suppliers'),
          authFetch('/api/tenders'),
        ])
        const profileJson = await profileRes.json()
        const mailJson = await mailRes.json()
        const suppliersJson = await suppliersRes.json()
        const tendersJson = await tendersRes.json()

        const profile = profileJson.data
        const hasMail = mailJson.success && !!mailJson.data
        const hasSupplier = suppliersJson.success && Array.isArray(suppliersJson.data) && suppliersJson.data.length > 0
        const hasTender = tendersJson.success && Array.isArray(tendersJson.data) && tendersJson.data.length > 0
        const onboardingDone = profile?.onboarding_done === true

        if (!onboardingDone && (!hasMail || !hasSupplier || !hasTender)) {
          setShowOnboarding(true)
        } else if (onboardingDone && profile?.tour_done !== true) {
          requestProductTour()
        }
      } catch {
        /* ignore */
      }
      setChecked(true)
    }

    check()
  }, [ready, accessToken])

  if (!checked || !showOnboarding) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9990,
      background: 'var(--bg-primary)',
      overflowY: 'auto', padding: '24px 28px 80px',
    }}>
      <Onboarding
        onComplete={() => {
          setShowOnboarding(false)
          requestProductTour()
        }}
      />
    </div>
  )
}
