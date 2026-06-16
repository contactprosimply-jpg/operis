'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { authFetch, setAccessToken } from '@/lib/auth-client'
import { readBillingCache, writeBillingCache, clearBillingCache } from '@/lib/billing/billing-cache'
import { AppLoadingScreen } from '@/components/AppLoadingScreen'
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

const BOOTSTRAP_MAX_MS = 2500

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [hasBillingAccess, setHasBillingAccess] = useState(false)

  const billingFetchedForUser = useRef<string | null>(null)
  const userId = session?.user?.id ?? null

  const isPublic = isPublicRoute(pathname)
  const isBillingExempt = isBillingExemptRoute(pathname)

  const refreshBillingAccess = useCallback(async () => {
    if (!userId) return false
    const access = await fetchBillingAccess(userId)
    setHasBillingAccess(access)
    writeBillingCache(userId, access)
    return access
  }, [userId])

  // Bootstrap auth — timeout garanti, jamais bloquer indéfiniment
  useEffect(() => {
    let mounted = true
    const bootstrapTimer = setTimeout(() => {
      if (mounted) setBootstrapped(true)
    }, BOOTSTRAP_MAX_MS)

    if (typeof console !== 'undefined' && console.time) console.time('[auth] bootstrap')

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setAccessToken(session?.access_token ?? null)
      setReady(true)
      setBootstrapped(true)
      if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] bootstrap')
    }).catch((err) => {
      console.warn('[auth] bootstrap getSession error', err)
      if (!mounted) return
      setReady(true)
      setBootstrapped(true)
      if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] bootstrap')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return

      // TOKEN_REFRESHED au refocus : mettre à jour le token sans re-render global
      if (event === 'TOKEN_REFRESHED') {
        setAccessToken(nextSession?.access_token ?? null)
        return
      }

      if (event === 'SIGNED_OUT') {
        clearBillingCache()
        billingFetchedForUser.current = null
        setSession(null)
        setAccessToken(null)
        setHasBillingAccess(false)
        setReady(true)
        return
      }

      const nextUserId = nextSession?.user?.id ?? null
      if (event === 'SIGNED_IN' && nextUserId && billingFetchedForUser.current !== nextUserId) {
        billingFetchedForUser.current = null
        const cached = readBillingCache(nextUserId)
        setHasBillingAccess(cached === true)
      }

      setSession(nextSession)
      setAccessToken(nextSession?.access_token ?? null)
      setReady(true)
    })

    return () => {
      mounted = false
      clearTimeout(bootstrapTimer)
      subscription.unsubscribe()
    }
  }, [])

  // Billing : une vérif initiale par utilisateur, puis refresh silencieux en arrière-plan
  useEffect(() => {
    if (!ready || !userId) {
      if (ready && !userId) setHasBillingAccess(false)
      return
    }

    const cached = readBillingCache(userId)
    if (cached === true) setHasBillingAccess(true)
    else if (cached === false) setHasBillingAccess(false)

    if (billingFetchedForUser.current === userId) return
    billingFetchedForUser.current = userId

    fetchBillingAccess(userId).then(access => {
      setHasBillingAccess(access)
      writeBillingCache(userId, access)
    })
  }, [ready, userId])

  // Paywall : redirection sans bloquer le rendu
  useEffect(() => {
    if (!bootstrapped || !ready) return

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
  }, [bootstrapped, ready, session, hasBillingAccess, pathname, router, isPublic, isBillingExempt])

  // Écran de chargement UNIQUEMENT au premier bootstrap (max ~2.5s), jamais au refocus
  if (!bootstrapped && !isPublic) {
    return <AppLoadingScreen />
  }

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
