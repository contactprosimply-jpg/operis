'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { Spinner } from '@/components/ui'

/** Utilisateurs connectés → AO ; visiteurs → page de présentation */
export default function AppEntryPage() {
  const { session } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (session) router.replace('/tenders')
    else router.replace('/')
  }, [session, router])

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
