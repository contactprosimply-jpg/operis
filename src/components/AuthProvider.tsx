'use client'

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { authFetch, setAccessToken } from '@/lib/auth-client'
import { readBillingCache, writeBillingCache, clearBillingCache } from '@/lib/billing/billing-cache'
import { AppLoadingScreen } from '@/components/AppLoadingScreen'
import { isAuthEntryRoute, isBillingExemptRoute, isPublicRoute } from '@/lib/public-routes'

type AuthContextValue = {
  session: Session | null
  accessToken: string | null
  ready: boolean
  hasBillingAccess: boolean
  refreshBillingAccess: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  accessToken: null,
  ready: false,
  hasBillingAccess: false,
  refreshBillingAccess: async () => false,
})

export function useAuth() {
  return useContext(AuthContext)
}

async function fetchBillingAccess(): Promise<boolean> {
  if (typeof console !== 'undefined' && console.time) console.time('[auth] billing/status')
  try {
    const json = await authFetch('/api/billing/status').then(r => r.json())
    return Boolean(json.success && json.data?.has_access)
  } catch (err) {
    console.warn('[auth] billing/status failed', err)
    return false
  } finally {
    if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] billing/status')
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [billingChecked, setBillingChecked] = useState(false)
  const [hasBillingAccess, setHasBillingAccess] = useState(false)
  const [trustedCacheAccess, setTrustedCacheAccess] = useState(false)

  const isPublic = isPublicRoute(pathname)
  const isBillingExempt = isBillingExemptRoute(pathname)
  const userId = session?.user?.id

  const refreshBillingAccess = useCallback(async () => {
    const access = await fetchBillingAccess()
    setHasBillingAccess(access)
    setBillingChecked(true)
    if (userId) writeBillingCache(userId, access)
    return access
  }, [userId])

  useEffect(() => {
    let mounted = true

    if (typeof console !== 'undefined' && console.time) console.time('[auth] bootstrap')

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setAccessToken(session?.access_token ?? null)
      setReady(true)
      if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] bootstrap')
    }).catch((err) => {
      console.warn('[auth] bootstrap getSession error', err)
      if (!mounted) return
      setReady(true)
      if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] bootstrap')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      setSession(session)
      setAccessToken(session?.access_token ?? null)
      setReady(true)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        if (event === 'SIGNED_OUT') clearBillingCache()
        setBillingChecked(false)
        setTrustedCacheAccess(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!ready) return

    if (!session) {
      setHasBillingAccess(false)
      setBillingChecked(true)
      setTrustedCacheAccess(false)
      return
    }

    const cached = readBillingCache(session.user.id)
    if (cached === true) {
      setHasBillingAccess(true)
      setBillingChecked(true)
      setTrustedCacheAccess(true)
    } else {
      setTrustedCacheAccess(false)
      setBillingChecked(false)
      if (cached === false) setHasBillingAccess(false)
    }

    let cancelled = false
    fetchBillingAccess().then(access => {
      if (cancelled) return
      setHasBillingAccess(access)
      setBillingChecked(true)
      writeBillingCache(session.user.id, access)
    })

    return () => { cancelled = true }
  }, [ready, session?.user?.id])

  useEffect(() => {
    if (!ready || !session || !billingChecked) return

    if (isAuthEntryRoute(pathname)) {
      const target = hasBillingAccess ? '/dashboard' : '/choose-plan'
      if (pathname !== target) router.replace(target)
      return
    }

    if (!hasBillingAccess && !isPublic && !isBillingExempt && pathname !== '/choose-plan') {
      router.replace('/choose-plan')
    }
  }, [ready, session, billingChecked, hasBillingAccess, pathname, router, isPublic, isBillingExempt])

  const waitingAuth = !ready
  const waitingBillingGate = session
    && !billingChecked
    && !isPublic
    && !isBillingExempt
    && !trustedCacheAccess

  if (waitingAuth || waitingBillingGate) {
    return <AppLoadingScreen />
  }

  if (!session && !isPublic) {
    return <AppLoadingScreen message="Connexion…" />
  }

  return (
    <AuthContext.Provider value={{
      session,
      accessToken: session?.access_token ?? null,
      ready,
      hasBillingAccess,
      refreshBillingAccess,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
