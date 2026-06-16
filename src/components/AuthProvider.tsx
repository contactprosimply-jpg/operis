'use client'

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { authFetch, getSessionWithTimeout, setAccessToken } from '@/lib/auth-client'
import {
  clearAuthSessionStore,
  markAuthBootstrapped,
  markBillingFetched,
  readAuthSessionStore,
  wasBillingFetched,
} from '@/lib/auth-session-store'
import { readBillingCache, writeBillingCache, clearBillingCache } from '@/lib/billing/billing-cache'
import { isAuthEntryRoute, isBillingExemptRoute, isPublicRoute } from '@/lib/public-routes'

type AuthContextValue = {
  session: Session | null
  userId: string | null
  ready: boolean
  hasBillingAccess: boolean
  refreshBillingAccess: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  userId: null,
  ready: false,
  hasBillingAccess: false,
  refreshBillingAccess: async () => false,
})

export function useAuth() {
  return useContext(AuthContext)
}

async function fetchBillingAccess(userId: string): Promise<boolean> {
  if (typeof console !== 'undefined' && console.time) console.time('[auth] billing/status')
  try {
    const json = await authFetch('/api/billing/status').then(r => r.json())
    return Boolean(json.success && json.data?.has_access)
  } catch (err) {
    console.warn('[auth] billing/status failed', err)
    return readBillingCache(userId) === true
  } finally {
    if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] billing/status')
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const initial = readAuthSessionStore()

  const [session, setSession] = useState<Session | null>(initial.session)
  const [ready, setReady] = useState(initial.bootstrapped)
  const [hasBillingAccess, setHasBillingAccess] = useState(() => {
    if (!initial.userId) return false
    return readBillingCache(initial.userId) === true
  })

  const userId = session?.user?.id ?? null
  const isPublic = isPublicRoute(pathname)
  const isBillingExempt = isBillingExemptRoute(pathname)

  const refreshBillingAccess = useCallback(async () => {
    if (!userId) return false
    const access = await fetchBillingAccess(userId)
    setHasBillingAccess(access)
    writeBillingCache(userId, access)
    markBillingFetched(userId)
    return access
  }, [userId])

  // Bootstrap auth (timeout court) — état module survivant aux navigations
  useEffect(() => {
    let mounted = true

    if (initial.bootstrapped) {
      if (typeof console !== 'undefined') console.info('[auth] bootstrap skipped (module cache)')
      return
    }

    if (typeof console !== 'undefined' && console.time) console.time('[auth] bootstrap')

    getSessionWithTimeout().then(({ data: { session: s } }) => {
      if (!mounted) return
      setSession(s)
      setAccessToken(s?.access_token ?? null)
      setReady(true)
      markAuthBootstrapped(s)
      if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] bootstrap')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return

      if (event === 'TOKEN_REFRESHED') {
        setAccessToken(nextSession?.access_token ?? null)
        return
      }

      if (event === 'INITIAL_SESSION') {
        setAccessToken(nextSession?.access_token ?? null)
        if (!readAuthSessionStore().bootstrapped) {
          setSession(nextSession)
          setReady(true)
          markAuthBootstrapped(nextSession)
        }
        return
      }

      if (event === 'SIGNED_OUT') {
        clearBillingCache()
        clearAuthSessionStore()
        setSession(null)
        setAccessToken(null)
        setHasBillingAccess(false)
        setReady(true)
        return
      }

      const nextUserId = nextSession?.user?.id ?? null
      if (event === 'SIGNED_IN' && nextUserId) {
        const cached = readBillingCache(nextUserId)
        if (cached === true) setHasBillingAccess(true)
      }

      setSession(nextSession)
      setAccessToken(nextSession?.access_token ?? null)
      setReady(true)
      markAuthBootstrapped(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [initial.bootstrapped])

  // Billing : une seule vérif serveur par utilisateur (module store), jamais bloquant
  useEffect(() => {
    if (!ready || !userId) {
      if (ready && !userId) setHasBillingAccess(false)
      return
    }

    const cached = readBillingCache(userId)
    if (cached === true) setHasBillingAccess(true)
    else if (cached === false) setHasBillingAccess(false)

    if (wasBillingFetched(userId)) return

    markBillingFetched(userId)
    fetchBillingAccess(userId).then(access => {
      setHasBillingAccess(access)
      writeBillingCache(userId, access)
    })
  }, [ready, userId])

  // Paywall : redirection sans bloquer le rendu
  useEffect(() => {
    if (!ready) return

    if (!session && !isPublic) {
      router.replace('/login')
      return
    }

    if (!session) return

    if (isAuthEntryRoute(pathname)) {
      const target = hasBillingAccess ? '/dashboard' : '/choose-plan'
      if (pathname !== target) router.replace(target)
      return
    }

    if (!hasBillingAccess && !isPublic && !isBillingExempt && pathname !== '/choose-plan') {
      router.replace('/choose-plan')
    }
  }, [ready, session, hasBillingAccess, pathname, router, isPublic, isBillingExempt])

  // Log navigation timing
  useEffect(() => {
    if (typeof console !== 'undefined' && console.time) {
      console.time(`[nav] ${pathname}`)
      const id = requestAnimationFrame(() => {
        console.timeEnd(`[nav] ${pathname}`)
      })
      return () => cancelAnimationFrame(id)
    }
  }, [pathname])

  // Ne jamais bloquer le rendu global — shell + pages toujours montés
  return (
    <AuthContext.Provider value={{
      session,
      userId,
      ready,
      hasBillingAccess,
      refreshBillingAccess,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
