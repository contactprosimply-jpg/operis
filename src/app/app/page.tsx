'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { Spinner } from '@/components/ui'

/** Point d'entrée démo / application : connexion puis appels d'offres. */
export default function AppEntryPage() {
  const { ready, session } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!ready) return
    if (session) router.replace('/tenders')
    else router.replace('/login?redirect=/tenders')
  }, [ready, session, router])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}
    >
      <Spinner />
    </div>
  )
}
