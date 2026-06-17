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
  const { userId } = useAuth()
  const [checked, setChecked] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (!userId) {
      setChecked(true)
      return
    }

    const check = async () => {
      try {
        const [profileRes] = await Promise.all([
          authFetch('/api/profile'),
        ])
        const profileJson = await profileRes.json()

        const profile = profileJson.data
        const onboardingDone = profile?.onboarding_done === true

        if (!onboardingDone) {
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
  }, [userId])

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
