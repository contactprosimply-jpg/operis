'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { setAccessToken } from '@/lib/auth-client'
import { Spinner } from '@/components/ui'

const PUBLIC_ROUTES = ['/login', '/register']

type AuthContextValue = {
  session: Session | null
  accessToken: string | null
  ready: boolean
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  accessToken: null,
  ready: false,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setAccessToken(session?.access_token ?? null)
      setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session)
      setAccessToken(session?.access_token ?? null)
      setReady(true)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const isPublic = PUBLIC_ROUTES.includes(pathname)
    if (!session && !isPublic) router.replace('/login')
    if (session && isPublic) router.replace('/dashboard')
  }, [ready, session, pathname, router])

  const isPublic = PUBLIC_ROUTES.includes(pathname)

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117' }}>
        <Spinner size={28} />
      </div>
    )
  }

  if (!session && !isPublic) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117' }}>
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ session, accessToken: session?.access_token ?? null, ready }}>
      {children}
    </AuthContext.Provider>
  )
}
