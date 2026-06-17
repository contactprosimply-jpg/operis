import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { setAccessToken } from './auth-client'

const BOOT_KEY = 'operis_auth_bootstrapped'
const SESSION_KEY = 'operis_auth_session_snapshot'

/** État auth persistant entre remontages React / navigations (module singleton). */
const store = {
  bootstrapped: false,
  session: null as Session | null,
  userId: null as string | null,
  billingFetchedForUserId: null as string | null,
}

function readPersistedBoot(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(BOOT_KEY) === '1'
  } catch {
    return false
  }
}

function persistBoot() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(BOOT_KEY, '1')
  } catch {
    /* ignore */
  }
}

function persistSessionSnapshot(session: Session | null) {
  if (typeof window === 'undefined') return
  try {
    if (!session) {
      sessionStorage.removeItem(SESSION_KEY)
      return
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      userId: session.user.id,
      email: session.user.email,
      access_token: session.access_token,
      expires_at: session.expires_at,
    }))
  } catch {
    /* ignore */
  }
}

export function readAuthSessionStore() {
  if (!store.bootstrapped && readPersistedBoot()) {
    store.bootstrapped = true
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (raw) {
        const snap = JSON.parse(raw) as {
          userId: string
          email?: string
          access_token?: string
        }
        store.userId = snap.userId
        if (snap.access_token) setAccessToken(snap.access_token)
      }
    } catch {
      /* ignore */
    }
  }
  return { ...store }
}

export function markAuthBootstrapped(session: Session | null) {
  store.bootstrapped = true
  store.session = session
  store.userId = session?.user?.id ?? null
  persistBoot()
  persistSessionSnapshot(session)
  if (session?.access_token) setAccessToken(session.access_token)
}

export function syncAuthSessionSilent(session: Session | null) {
  store.session = session
  store.userId = session?.user?.id ?? null
  persistSessionSnapshot(session)
  if (session?.access_token) setAccessToken(session.access_token)
}

export function clearAuthSessionStore() {
  store.bootstrapped = true
  store.session = null
  store.userId = null
  store.billingFetchedForUserId = null
  persistBoot()
  persistSessionSnapshot(null)
}

export function markBillingFetched(userId: string) {
  store.billingFetchedForUserId = userId
}

export function wasBillingFetched(userId: string) {
  return store.billingFetchedForUserId === userId
}

export function isAuthBootstrapped() {
  return store.bootstrapped || readPersistedBoot()
}

type AuthEventHandler = (event: string, session: Session | null) => void

const authHandlers = new Set<AuthEventHandler>()
let authListenerRegistered = false

/** Un seul listener Supabase pour toute l'app (survit aux remontages). */
export function subscribeAuthEvents(handler: AuthEventHandler) {
  authHandlers.add(handler)
  ensureGlobalAuthListener()
  return () => {
    authHandlers.delete(handler)
  }
}

function ensureGlobalAuthListener() {
  if (authListenerRegistered) return
  authListenerRegistered = true

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') {
      setAccessToken(session?.access_token ?? null)
      syncAuthSessionSilent(session)
      authHandlers.forEach(h => h(event, session))
      return
    }
    authHandlers.forEach(h => h(event, session))
  })
}
