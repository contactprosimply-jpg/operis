'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { authFetch, getSessionWithTimeout, setAccessToken } from '@/lib/auth-client'
import {
  clearAuthSessionStore,
  isAuthBootstrapped,
  markAuthBootstrapped,
  markBillingFetched,
  readAuthSessionStore,
  subscribeAuthEvents,
  syncAuthSessionSilent,
  wasBillingFetched,
} from '@/lib/auth-session-store'
import { readBillingCache, writeBillingCache, clearBillingCache } from '@/lib/billing/billing-cache'
import { isAuthEntryRoute, isAppRoute, isBillingExemptRoute, isPublicRoute, isWebsiteMemberRoute, POST_AUTH_ROUTE } from '@/lib/public-routes'
import { accountChangedOnThisDevice, rememberCurrentAccount, resetLocalCachesForNewAccount } from '@/lib/account-switch-guard'
import { Spinner } from '@/components/ui'

const LOADING_GUARD_MS = 8000

type AuthContextValue = {
  session: Session | null
  userId: string | null
  /** Toujours true après le 1er paint — ne bloque jamais l'UI */
  ready: boolean
  hasBillingAccess: boolean
  refreshBillingAccess: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  userId: null,
  ready: true,
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
    const cached = readBillingCache(userId)
    return cached === true
  } finally {
    if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] billing/status')
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const initial = readAuthSessionStore()
  const userIdRef = useRef<string | null>(initial.userId ?? initial.session?.user?.id ?? null)

  const [session, setSession] = useState<Session | null>(initial.session)
  const [ready, setReady] = useState(true)
  const [hasBillingAccess, setHasBillingAccess] = useState(() => {
    const uid = initial.userId ?? initial.session?.user?.id
    if (!uid) return false
    return readBillingCache(uid) === true
  })
  // Un rechargement complet (hard reload / lien profond) démarre toujours avec `session`
  // à null le temps que getSession() résolve en arrière-plan (readAuthSessionStore ne
  // restaure que le userId, pas la session). Sans ce garde-fou, la redirection vers /login
  // se déclenche à tort pour un utilisateur pourtant déjà connecté.
  const hasPersistedUser = Boolean(initial.userId ?? initial.session?.user?.id)
  const [sessionChecked, setSessionChecked] = useState(false)

  const userId = session?.user?.id ?? initial.userId ?? null
  userIdRef.current = userId

  // Poste partagé entre plusieurs personnes (chacune avec son propre compte Operis) : si le
  // compte courant diffère du dernier connu sur cette machine, le cache mail local (IndexedDB)
  // et les préférences UI en cache doivent être purgés AVANT que quoi que ce soit ne les lise —
  // d'où le blocage du rendu des enfants tant que ce n'est pas fait (uniquement dans ce cas rare,
  // jamais pour le cas courant "même utilisateur qu'avant").
  const [cacheGuardReady, setCacheGuardReady] = useState(() => {
    const initialUserId = initial.userId ?? initial.session?.user?.id ?? null
    return !initialUserId || !accountChangedOnThisDevice(initialUserId)
  })

  useEffect(() => {
    if (!userId) return
    if (!accountChangedOnThisDevice(userId)) {
      rememberCurrentAccount(userId)
      setCacheGuardReady(true)
      return
    }
    let cancelled = false
    setCacheGuardReady(false)
    void resetLocalCachesForNewAccount(userId).then(() => {
      if (!cancelled) setCacheGuardReady(true)
    })
    return () => { cancelled = true }
  }, [userId])

  const isPublic = isPublicRoute(pathname)
  const isBillingExempt = isBillingExemptRoute(pathname)
  const isMemberSite = isWebsiteMemberRoute(pathname)

  const refreshBillingAccess = useCallback(async () => {
    if (!userIdRef.current) return false
    const access = await fetchBillingAccess(userIdRef.current)
    setHasBillingAccess(access)
    writeBillingCache(userIdRef.current, access)
    markBillingFetched(userIdRef.current)
    return access
  }, [])

  // Garde-fou : ready ne reste jamais bloqué (exigence #4)
  useEffect(() => {
    const guard = setTimeout(() => {
      setReady(true)
      setSessionChecked(true)
      if (!isAuthBootstrapped()) {
        markAuthBootstrapped(session)
      }
      console.warn('[auth] loading guard — forced ready after 8s')
    }, LOADING_GUARD_MS)
    return () => clearTimeout(guard)
  }, [session])

  // Bootstrap auth en arrière-plan — jamais bloquant
  useEffect(() => {
    let mounted = true

    if (typeof console !== 'undefined' && console.time) console.time('[auth] bootstrap')

    getSessionWithTimeout().then(({ data: { session: s } }) => {
      if (!mounted) return
      if (s) {
        setSession(s)
        setAccessToken(s.access_token ?? null)
        markAuthBootstrapped(s)
      } else if (isAuthBootstrapped()) {
        /* garde session/token du cache */
      } else {
        markAuthBootstrapped(null)
      }
      setReady(true)
      setSessionChecked(true)
      if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] bootstrap')
    }).catch(() => {
      if (!mounted) return
      setReady(true)
      setSessionChecked(true)
      markAuthBootstrapped(session)
    })

    const unsub = subscribeAuthEvents((event, nextSession) => {
      if (!mounted) return

      // #1 — TOKEN_REFRESHED : silencieux, pas de remount / pas de loading
      if (event === 'TOKEN_REFRESHED') {
        syncAuthSessionSilent(nextSession)
        return
      }

      if (event === 'INITIAL_SESSION') {
        setAccessToken(nextSession?.access_token ?? null)
        if (!isAuthBootstrapped()) {
          setSession(nextSession)
          markAuthBootstrapped(nextSession)
        }
        setReady(true)
        setSessionChecked(true)
        return
      }

      if (event === 'SIGNED_OUT') {
        clearBillingCache()
        clearAuthSessionStore()
        setSession(null)
        setAccessToken(null)
        setHasBillingAccess(false)
        setReady(true)
        setSessionChecked(true)
        return
      }

      // #1 — SIGNED_IN après 1er chargement : mise à jour silencieuse
      if (event === 'SIGNED_IN' && isAuthBootstrapped()) {
        setAccessToken(nextSession?.access_token ?? null)
        syncAuthSessionSilent(nextSession)
        const sameUser = nextSession?.user?.id === userIdRef.current
        if (!sameUser) {
          setSession(nextSession)
          const cached = readBillingCache(nextSession?.user?.id ?? '')
          if (cached === true) setHasBillingAccess(true)
        }
        setReady(true)
        setSessionChecked(true)
        return
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setSession(nextSession)
        setAccessToken(nextSession?.access_token ?? null)
        markAuthBootstrapped(nextSession)
        setReady(true)
        setSessionChecked(true)
      }
    })

    return () => {
      mounted = false
      unsub()
    }
  }, [])

  // Billing : cache d'abord, fetch en arrière-plan, une fois par user
  useEffect(() => {
    if (!userId) {
      setHasBillingAccess(false)
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
  }, [userId])

  // Paywall : redirection sans bloquer le rendu
  useEffect(() => {
    // Un hard reload / lien profond démarre avec `session` à null le temps que la
    // vérification réelle arrive (voir hasPersistedUser plus haut) — tant qu'on n'a pas la
    // réponse et qu'on sait qu'un utilisateur était potentiellement connecté, on attend
    // au lieu de bounce à tort vers /login.
    if (!session && hasPersistedUser && !sessionChecked) return

    if (!session && isMemberSite) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }

    if (!session && !isPublic && !isBillingExempt) {
      const redirect = pathname && pathname !== '/login' ? encodeURIComponent(pathname) : ''
      router.replace(redirect ? `/login?redirect=${redirect}` : '/login')
      return
    }

    if (!session) return

    if (isAuthEntryRoute(pathname)) {
      if (pathname !== POST_AUTH_ROUTE) {
        const redirectParam = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('redirect')
          : null
        const safeRedirectTo = redirectParam?.startsWith('/') && !redirectParam.startsWith('//')
          ? redirectParam
          : POST_AUTH_ROUTE
        router.replace(safeRedirectTo)
      }
      return
    }

    if (!hasBillingAccess && isAppRoute(pathname) && !isBillingExempt) {
      router.replace('/choose-plan')
    }
  }, [session, hasBillingAccess, pathname, router, isPublic, isBillingExempt, isMemberSite, sessionChecked, hasPersistedUser])

  return (
    <AuthContext.Provider value={{
      session,
      userId,
      ready,
      hasBillingAccess,
      refreshBillingAccess,
    }}>
      {cacheGuardReady ? children : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <Spinner size={28} />
        </div>
      )}
    </AuthContext.Provider>
  )
}
