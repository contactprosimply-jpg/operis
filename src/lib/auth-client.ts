import { supabase } from './supabase'

let cachedToken: string | null = null

const GET_SESSION_TIMEOUT_MS = 4000
const AUTH_WAIT_TIMEOUT_MS = 2000
const FETCH_TIMEOUT_MS = 12000

export function setAccessToken(token: string | null) {
  cachedToken = token
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

async function getSessionFast() {
  if (typeof console !== 'undefined' && console.time) console.time('[auth] getSession')
  try {
    const result = await withTimeout(
      supabase.auth.getSession(),
      GET_SESSION_TIMEOUT_MS,
      'getSession',
    )
    return result
  } catch (err) {
    console.warn('[auth] getSession failed or timed out', err)
    return { data: { session: null }, error: null }
  } finally {
    if (typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[auth] getSession')
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (cachedToken) return cachedToken

  const { data: { session } } = await getSessionFast()
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      finish(session?.access_token ?? null)
    })

    const timer = setTimeout(() => finish(null), AUTH_WAIT_TIMEOUT_MS)
  })
}

export async function authFetch(url: string, options: RequestInit = {}) {
  const token = await getAccessToken()
  if (!token) {
    throw new Error('Non autorise')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    })

    if (res.status === 401) {
      cachedToken = null
      setAccessToken(null)
      await supabase.auth.signOut()
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      throw new Error('Non autorise')
    }
    return res
  } finally {
    clearTimeout(timeout)
  }
}
