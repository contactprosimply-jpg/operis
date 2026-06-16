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
      cachedToken = token
      resolve(token)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        finish(session?.access_token ?? null)
      }
    })

    const timer = setTimeout(() => finish(null), AUTH_WAIT_TIMEOUT_MS)
  })
}

async function fetchWithAuth(url: string, options: RequestInit, token: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function authFetch(url: string, options: RequestInit = {}) {
  const token = await getAccessToken()
  if (!token) {
    throw new Error('Non autorise')
  }

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
}
