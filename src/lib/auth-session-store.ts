import type { Session } from '@supabase/supabase-js'

/** État auth persistant entre remontages React / navigations (module singleton). */
const store = {
  bootstrapped: false,
  session: null as Session | null,
  userId: null as string | null,
  billingFetchedForUserId: null as string | null,
}

export function readAuthSessionStore() {
  return { ...store }
}

export function markAuthBootstrapped(session: Session | null) {
  store.bootstrapped = true
  store.session = session
  store.userId = session?.user?.id ?? null
}

export function clearAuthSessionStore() {
  store.bootstrapped = true
  store.session = null
  store.userId = null
  store.billingFetchedForUserId = null
}

export function markBillingFetched(userId: string) {
  store.billingFetchedForUserId = userId
}

export function wasBillingFetched(userId: string) {
  return store.billingFetchedForUserId === userId
}
