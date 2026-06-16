'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { authFetch, setAccessToken } from '@/lib/auth-client'
import { Spinner } from '@/components/ui'
import { isAuthEntryRoute, isBillingExemptRoute, isPublicRoute } from '@/lib/public-routes'

type AuthContextValue = {
  session: Session | null
  accessToken: string | null
  ready: boolean
  hasBillingAccess: boolean
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  accessToken: null,
  ready: false,
  hasBillingAccess: false,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [billingChecked, setBillingChecked] = useState(false)
  const [hasBillingAccess, setHasBillingAccess] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setAccessToken(session?.access_token ?? null)
      setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session)
      setAccessToken(session?.access_token ?? null)
      setReady(true)
      setBillingChecked(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!ready || !session) {
      if (ready && !session) setBillingChecked(true)
      return
    }

    let cancelled = false
    authFetch('/api/billing/status')
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        setHasBillingAccess(Boolean(json.success && json.data?.has_access))
        setBillingChecked(true)
      })
      .catch(() => {
        if (!cancelled) {
          setHasBillingAccess(false)
          setBillingChecked(true)
        }
      })

    return () => { cancelled = true }
  }, [ready, session, pathname])

  useEffect(() => {
    if (!ready || !session || !billingChecked) return

    const isPublic = isPublicRoute(pathname)
    const isBillingExempt = isBillingExemptRoute(pathname)

    if (isAuthEntryRoute(pathname)) {
      router.replace(hasBillingAccess ? '/dashboard' : '/choose-plan')
      return
    }

    if (!hasBillingAccess && !isPublic && !isBillingExempt) {
      router.replace('/choose-plan')
    }
  }, [ready, session, billingChecked, hasBillingAccess, pathname, router])

  const isPublic = isPublicRoute(pathname)
  const isBillingExempt = isBillingExemptRoute(pathname)
  const waitingBilling = session && !billingChecked && !isPublic

  if (!ready || waitingBilling) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117' }}>
        <Spinner size={28} />
      </div>
    )
  }

  if (!session && !isPublic) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117' }}>
        <Spinner size={28} />
      </div>
    )
  }

  if (session && !hasBillingAccess && !isPublic && !isBillingExempt) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117' }}>
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{
      session,
      accessToken: session?.access_token ?? null,
      ready,
      hasBillingAccess,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
