'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { Spinner } from '@/components/ui'

/** Utilisateurs connectés → AO ; visiteurs → page de présentation */
export default function AppEntryPage() {
  const { ready, session } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!ready) return
    if (session) router.replace('/tenders')
    else router.replace('/')
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
