'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { useTenders } from '@/hooks'
import { useToast } from '@/components/ui'
import { authFetch } from '@/lib/auth-client'
import { useAuth } from '@/components/AuthProvider'
import type { OrganizationPayload } from '@/lib/organization'
import {
  buildDashboardActions,
  computeStats,
  headline,
  pickActiveTenders,
  type DashboardAction,
  type DashboardExtra,
} from '@/lib/dashboard-actions'
import { StatsStrip } from '@/components/dashboard/StatsStrip'
import { ActionsCard } from '@/components/dashboard/ActionsCard'
import { ActiveTendersCard, RelaunchCard } from '@/components/dashboard/SideCards'

async function fetchExtra(): Promise<DashboardExtra | null> {
  try {
    const res = await authFetch('/api/dashboard/actions')
    const data = await res.json()
    return data.success ? (data.data as DashboardExtra) : null
  } catch {
    return null
  }
}

/** Dashboard : ne montre plus des chiffres, dit quoi faire. Tout est calculé depuis la base. */
export default function DashboardPage() {
  const { userId, session } = useAuth()
  const { tenders, loading, refetch } = useTenders()
  const { show, ToastComponent } = useToast()
  const [extra, setExtra] = useState<DashboardExtra | null>(null)
  const [extraError, setExtraError] = useState(false)
  const [org, setOrg] = useState<OrganizationPayload | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      const data = await fetchExtra()
      if (cancelled) return
      if (data) setExtra(data)
      setExtraError(!data)
    })()
    authFetch('/api/organization')
      .then(r => r.json())
      .then(d => { if (!cancelled && d.success) setOrg(d.data ?? null) })
      .catch(() => { /* l'indication « vue équipe » est facultative */ })
    return () => { cancelled = true }
  }, [userId])

  const reloadExtra = async () => {
    const data = await fetchExtra()
    if (data) setExtra(data)
    setExtraError(!data)
  }

  // « Relancer » : la relance existante, un fournisseur à la fois (uniquement ceux en retard).
  const handleRelaunch = async (action: DashboardAction) => {
    if (action.cta.kind !== 'relaunch') return
    const { tenderId, supplierIds } = action.cta
    setBusyId(action.id)
    let sent = 0
    let firstError = ''
    for (const supplierId of supplierIds) {
      try {
        const res = await authFetch(`/api/tenders/${tenderId}/relaunch`, {
          method: 'POST',
          body: JSON.stringify({ supplier_id: supplierId }),
          timeoutMs: 30000,
        })
        const data = await res.json()
        if (data.success) sent++
        else if (!firstError) firstError = data.error ?? 'Relance impossible'
      } catch (e) {
        if (!firstError) firstError = e instanceof Error ? e.message : 'Relance impossible'
      }
    }
    setBusyId(null)
    const ok = sent > 0 ? `${sent} relance${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}` : ''
    show(firstError ? (ok ? `${ok} — erreur : ${firstError}` : `Erreur : ${firstError}`) : ok)
    await Promise.all([refetch(true), reloadExtra()])
  }

  const firstName = session?.user?.user_metadata?.full_name?.split(' ')[0]
    ?? session?.user?.email?.split('@')[0]
    ?? 'vous'

  const mailEnabled = extra?.mailEnabled ?? true
  const ready = !(loading && tenders.length === 0) && (extra !== null || extraError)
  const stats = computeStats(tenders)
  const actions = ready
    ? buildDashboardActions({
        tenders,
        extra: extra ?? { dueRelaunches: [], pendingRelaunchConfirmations: 0, unlinkedQuotes: 0, unlinkedAoMails: 0, mailEnabled },
      })
    : []

  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  // Un propriétaire d'organisation voit les AO de toute l'équipe : on le dit à côté de la date.
  const teamView = !!org?.is_owner && (org.members?.length ?? 0) > 0

  return (
    <div className="db-page animate-fade">
      {ToastComponent}

      <header className="db-head">
        <div>
          <p className="db-date db-mono">
            {dateLabel}{teamView ? ' · Vue équipe' : ''}
          </p>
          <h1 className="db-h1">{ready ? headline(firstName, actions.length) : `Bonjour ${firstName}`}</h1>
        </div>
        <Link href="/tenders?new=1" className="db-btn-primary">
          <Plus size={18} aria-hidden />
          Nouvel AO
        </Link>
      </header>

      <StatsStrip stats={stats} unlinkedQuotes={extra?.unlinkedQuotes ?? null} mailEnabled={mailEnabled} />

      <div className="db-body">
        <ActionsCard
          actions={actions}
          loading={!ready}
          loadError={extraError}
          busyId={busyId}
          onRelaunch={a => void handleRelaunch(a)}
          onRetry={() => void reloadExtra()}
        />
        <div className="db-side">
          <ActiveTendersCard tenders={pickActiveTenders(tenders)} loading={loading && tenders.length === 0} />
          <RelaunchCard pending={extra ? extra.pendingRelaunchConfirmations : null} />
        </div>
      </div>
    </div>
  )
}
