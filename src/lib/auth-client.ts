import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

let cachedToken: string | null = null
let refreshInFlight: Promise<boolean> | null = null

export const NETWORK_TIMEOUT_MS = 8000
const GET_SESSION_TIMEOUT_MS = 4000
const AUTH_WAIT_TIMEOUT_MS = 2000

export function setAccessToken(token: string | null) {
  cachedToken = token
}

function readSupabaseTokenFromStorage(): string | null {
  if (typeof window === 'undefined') return null
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as {
        access_token?: string
        currentSession?: { access_token?: string }
      }
      return parsed.access_token ?? parsed.currentSession?.access_token ?? null
    }
  } catch {
    /* ignore */
  }
  return null
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

/** getSession avec timeout — utilisé au bootstrap et pour les fetchs API. */
export async function getSessionWithTimeout() {
  if (typeof console !== 'undefined' && console.time) console.time('[auth] getSession')
  try {
    return await withTimeout(
      supabase.auth.getSession(),
      GET_SESSION_TIMEOUT_MS,
      'getSession',
    )
  } catch (err) {
    console.warn('[auth] getSession failed or timed out', err)
    const fallback = readSupabaseTokenFromStorage()
    if (fallback) {
      cachedToken = fallback
      return { data: { session: null as Session | null }, error: null }
    }
    return { data: { session: null as Session | null }, error: null }
  } finally {
    if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] getSession')
  }
}

async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = withTimeout(
    supabase.auth.refreshSession(),
    NETWORK_TIMEOUT_MS,
    'refreshSession',
  ).then(({ data, error }) => {
    refreshInFlight = null
    if (error || !data.session?.access_token) return false
    cachedToken = data.session.access_token
    return true
  }).catch(() => {
    refreshInFlight = null
    return false
  })
  return refreshInFlight
}

export async function getAccessToken(): Promise<string | null> {
  if (cachedToken) return cachedToken

  const stored = readSupabaseTokenFromStorage()
  if (stored) {
    cachedToken = stored
    return cachedToken
  }

  const { data: { session } } = await getSessionWithTimeout()
  if (session?.access_token) {
    cachedToken = session.access_token
    return cachedToken
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (token: string | null) => {
      if (settled) return
      settled = true
      subscription.unsubscribe()
      clearTimeout(timer)
      cachedToken = token ?? readSupabaseTokenFromStorage()
      resolve(cachedToken)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        finish(session?.access_token ?? null)
      }
    })

    const timer = setTimeout(() => finish(readSupabaseTokenFromStorage()), AUTH_WAIT_TIMEOUT_MS)
  })
}

export type AuthFetchOptions = RequestInit & {
  /** Délai max en ms. `null` = pas de timeout (sync IMAP longue). Défaut : NETWORK_TIMEOUT_MS. */
  timeoutMs?: number | null
}

async function fetchWithAuth(
  url: string,
  options: AuthFetchOptions,
  token: string,
) {
  const timeoutMs = options.timeoutMs === undefined ? NETWORK_TIMEOUT_MS : options.timeoutMs
  const { timeoutMs: _omit, ...fetchOptions } = options
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs !== null) {
    timeout = setTimeout(() => controller.abort(), timeoutMs)
  }
  const userSignal = fetchOptions.signal
  if (userSignal) {
    userSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(fetchOptions.headers ?? {}),
      },
    })
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function authFetch(url: string, options: AuthFetchOptions = {}) {
  const token = await getAccessToken()
  if (!token) {
    throw new Error('Non autorise')
  }

  try {
    let res = await fetchWithAuth(url, options, token)

    if (res.status === 401) {
      const refreshed = await tryRefreshSession()
      if (refreshed && cachedToken) {
        res = await fetchWithAuth(url, options, cachedToken)
      }
      if (res.status === 401) {
        throw new Error('Non autorise')
      }
    }

    return res
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      const ms = options.timeoutMs === undefined ? NETWORK_TIMEOUT_MS : options.timeoutMs
      throw new Error(ms === null ? 'Requête annulée' : `Timeout reseau (${ms}ms)`)
    }
    throw err
  }
}
