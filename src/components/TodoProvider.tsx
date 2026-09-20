'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { getAccessToken } from '@/lib/auth-client'
import { Modal } from '@/components/ui'
import PriorityPanelContent from '@/components/PriorityPanelContent'
import {
  buildPayload,
  describeCounts,
  parisClock,
  type PriorityPayload,
} from '@/lib/priorities-rules'

interface TodoContextValue {
  todo: PriorityPayload | null
  loading: boolean
  open: boolean
  openTodo: () => void
  closeTodo: () => void
}

const NOOP: TodoContextValue = { todo: null, loading: false, open: false, openTodo: () => {}, closeTodo: () => {} }
const TodoContext = createContext<TodoContextValue>(NOOP)

/** Liste « À traiter » : données, fenêtre pop-up et ouverture automatique à la 1re connexion du jour. */
export const useTodo = () => useContext(TodoContext)

const POLL_MS = 180_000

async function authedFetch(input: string, init: RequestInit = {}): Promise<Response | null> {
  const token = await getAccessToken()
  if (!token) return null
  return fetch(input, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  })
}

/**
 * `enabled` = on est dans l'application (pas sur les pages du site ni le paywall). Le fournisseur
 * reste monté par-dessus le changement d'écran : au premier chargement d'un navigateur l'app
 * repasse par /choose-plan le temps de lire la facturation, et un état porté par la barre
 * latérale se perdait dans l'aller-retour.
 */
export function TodoProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { userId } = useAuth()
  const [todo, setTodo] = useState<PriorityPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const refetchRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!enabled || !userId) return
    let cancelled = false
    const fetchTodo = async () => {
      try {
        const res = await authedFetch('/api/priorities')
        const data = await res?.json()
        if (!cancelled && data?.success) setTodo(data.data as PriorityPayload)
      } catch { /* garde la dernière liste connue */ }
      finally { if (!cancelled) setLoading(false) }
    }
    refetchRef.current = fetchTodo
    void fetchTodo()
    const iv = setInterval(() => { if (!cancelled) void fetchTodo() }, POLL_MS)
    return () => { cancelled = true; clearInterval(iv); refetchRef.current = null }
  }, [enabled, userId])

  // Toujours à jour quand on ouvre la fenêtre.
  useEffect(() => {
    if (open) void refetchRef.current?.()
  }, [open])

  // ── Ouverture automatique : 1re connexion de la journée, une fois, s'il y a quelque chose ──
  const autoCheckedRef = useRef(false)
  const autoOpenedRef = useRef(false)

  useEffect(() => {
    if (!enabled || autoCheckedRef.current) return
    if (!userId || loading || !todo) return
    const today = parisClock().date
    const key = `operis_todo_autoopen:${userId}`
    autoCheckedRef.current = true
    try {
      if (localStorage.getItem(key) === today) return
      // Rien à traiter à la connexion : la journée est consommée (pas d'ouverture surprise plus tard).
      if (todo.total === 0) { localStorage.setItem(key, today); return }
    } catch { return }

    void (async () => {
      try {
        const res = await authedFetch('/api/notification-settings')
        const data = await res?.json()
        if (data?.success && data.data?.digest_enabled === false) {
          try { localStorage.setItem(key, today) } catch { /* ignore */ }
          return
        }
      } catch { /* réglage illisible : on ouvre quand même */ }
      autoOpenedRef.current = true
      setOpen(true)
    })()
  }, [enabled, userId, loading, todo])

  // La journée n'est marquée « vue » qu'une fois la fenêtre restée ouverte 2 s, ou fermée à la main.
  useEffect(() => {
    if (!autoOpenedRef.current || !userId || !enabled) return
    const today = parisClock().date
    const markSeen = () => { try { localStorage.setItem(`operis_todo_autoopen:${userId}`, today) } catch { /* ignore */ } }
    if (!open) { markSeen(); return }
    const t = setTimeout(markSeen, 2000)
    return () => clearTimeout(t)
  }, [open, userId, enabled])

  const handle = async (emailId: string) => {
    setTodo(prev => (prev ? buildPayload(prev.items.filter(i => i.emailId !== emailId)) : prev))
    const res = await authedFetch('/api/priorities', { method: 'POST', body: JSON.stringify({ email_id: emailId, handled: true }) })
    if (!res || !res.ok) void refetchRef.current?.()
  }

  const value = useMemo<TodoContextValue>(() => ({
    todo, loading, open: open && enabled,
    openTodo: () => setOpen(true),
    closeTodo: () => setOpen(false),
  }), [todo, loading, open, enabled])

  const summary = todo && todo.total > 0 ? describeCounts(todo.counts) : ''

  return (
    <TodoContext.Provider value={value}>
      {children}
      {enabled && (
        <Modal open={open} onClose={() => setOpen(false)} title={todo && todo.total > 0 ? `À traiter · ${todo.total}` : 'À traiter'} size="lg">
          {summary && (
            <div style={{
              margin: '-4px 0 14px', padding: '12px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.45,
              background: 'var(--accent-soft)', border: '1px solid var(--border-hi)', color: 'var(--text-primary)',
            }}>
              <strong>{todo?.total} élément{(todo?.total ?? 0) > 1 ? 's attendent' : ' attend'} votre action.</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>{summary}</div>
            </div>
          )}
          <div style={{ margin: '0 -18px' }}>
            <PriorityPanelContent large payload={todo} loading={loading} onClosePanel={() => setOpen(false)} onHandled={id => void handle(id)} />
          </div>
        </Modal>
      )}
    </TodoContext.Provider>
  )
}
