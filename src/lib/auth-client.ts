import { supabase } from './supabase'

let cachedToken: string | null = null

export function setAccessToken(token: string | null) {
  cachedToken = token
}

export async function getAccessToken(): Promise<string | null> {
  if (cachedToken) return cachedToken

  const { data: { session } } = await supabase.auth.getSession()
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

    const timer = setTimeout(() => finish(null), 5000)
  })
}

export async function authFetch(url: string, options: RequestInit = {}) {
  const token = await getAccessToken()
  if (!token) {
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('Non autorise')
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  })
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login'
    throw new Error('Non autorise')
  }
  return res
}
