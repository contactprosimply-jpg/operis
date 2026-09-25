'use client'

import { Suspense, useState, useEffect, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTenders } from '@/hooks'
import { authFetch } from '@/lib/auth-client'
import { useAuth } from '@/components/AuthProvider'
import TenderOriginBadge from '@/components/TenderOriginBadge'
import type { OrganizationPayload } from '@/lib/organization'
import {
  creatorColumnLabel,
  getTenderAssigneeLabel,
  getTenderCreatorLabel,
} from '@/lib/tender-member-label'
import { tenderSetupUrl } from '@/lib/tender-setup-nav'
import { MotionConfig } from 'framer-motion'
import { TenderCard } from '@/components/tender/TenderCard'
import { TenderKanban } from '@/components/tender/TenderKanban'
import { TenderViewSwitch, type TenderViewMode } from '@/components/tender/TenderViewSwitch'
import { Button, Modal, Field, Badge, useToast, Card, KpiCard, tenderListRowStyle, TableSkeleton } from '@/components/ui'
import { TONE_VARS, tenderStageDisplay } from '@/lib/tender-stage'
import type { TenderStatus } from '@/types/database'

const STATUS_OPTIONS: { value: TenderStatus; label: string }[] = [
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'urgence', label: 'Urgence' },
  { value: 'gagne', label: 'Gagné' },
  { value: 'perdu', label: 'Perdu' },
  { value: 'cloture', label: 'Clôturé' },
]

const PRIORITE_LABEL: Record<string, { label: string; color: string; icon: string }> = {
  basse: { label: 'Basse', color: '#475569', icon: '↓' },
  normale: { label: 'Normale', color: '#94a3b8', icon: '→' },
  haute: { label: 'Haute', color: '#f59e0b', icon: '↑' },
  urgente: { label: 'Urgente', color: '#ef4444', icon: '⚡' },
}

const VIEW_STORAGE_KEY = 'operis_tenders_view'
const VIEW_CHANGED_EVENT = 'operis:tenders-view-changed'
const VIEW_MODES: TenderViewMode[] = ['liste', 'cartes', 'kanban']

// Choix d'affichage mémorisé sur l'appareil. Si le stockage est bloqué, il vit en mémoire le
// temps de la session (le sélecteur reste fonctionnel).
let viewInMemory: TenderViewMode = 'liste'

function subscribeView(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(VIEW_CHANGED_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(VIEW_CHANGED_EVENT, onChange)
  }
}

function getViewSnapshot(): TenderViewMode {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY) as TenderViewMode | null
    if (saved && VIEW_MODES.includes(saved)) return saved
  } catch { /* stockage indisponible */ }
  return viewInMemory
}

function changeView(next: TenderViewMode) {
  viewInMemory = next
  try { localStorage.setItem(VIEW_STORAGE_KEY, next) } catch { /* ignore */ }
  window.dispatchEvent(new Event(VIEW_CHANGED_EVENT))
}
// Le Kanban montre déjà tous les statuts en colonnes : seuls ces filtres y ont un sens.
const KANBAN_FILTERS = ['tous', 'mes_assignes']

function deadlineColor(days: number | null) {
  if (days === null) return 'var(--text-secondary)'
  if (days < 0 || days <= 3) return '#f87171'
  if (days <= 7) return '#fbbf24'
  return '#34d399'
}

function formatBudget(v?: number | null) {
  if (!v) return '—'
  return `${v.toLocaleString('fr-FR')} €`
}

/**
 * Arrivée depuis le dashboard : ?new=1 ouvre « Nouvel AO », ?filter=sans_echeance filtre la liste.
 * Lu via useSearchParams (window.location est encore périmé pendant une navigation client), puis
 * l'URL est nettoyée pour qu'un rechargement ne rouvre pas la modale.
 */
function DashboardDeepLink({ onNew, onFilter }: { onNew: () => void; onFilter: (f: string) => void }) {
  const router = useRouter()
  const params = useSearchParams()
  useEffect(() => {
    if (params.get('new') === '1') onNew()
    if (params.get('filter') === 'sans_echeance') onFilter('sans_echeance')
    if (params.has('new') || params.has('filter')) router.replace('/tenders')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])
  return null
}

export default function TendersPage() {
  const router = useRouter()
  const { session } = useAuth()
  const currentUserId = session?.user?.id
  const { tenders, loading, refreshing, create, markStatus } = useTenders()
  const { show, ToastComponent } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState('actifs')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', client: '', deadline: '', description: '', is_own_client: false })
  const [org, setOrg] = useState<OrganizationPayload | null>(null)
  const view = useSyncExternalStore(subscribeView, getViewSnapshot, () => 'liste' as TenderViewMode)

  useEffect(() => {
    authFetch('/api/organization')
      .then(r => r.json())
      .then(data => { if (data.success) setOrg(data.data ?? null) })
      .catch(() => {})
  }, [])

  const inTeam = !!org?.members?.length
  const showCreatorColumn = inTeam || tenders.some(t => !!t.creator_label)
  const tableColCount = showCreatorColumn ? 8 : 7

  const effectiveFilter = view === 'kanban' && !KANBAN_FILTERS.includes(filter) ? 'tous' : filter
  const byStatus = effectiveFilter === 'actifs'
    ? tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status))
    : effectiveFilter === 'tous' ? tenders
    : effectiveFilter === 'mes_assignes' ? tenders.filter(t => t.assigned_to === currentUserId)
    : effectiveFilter === 'sans_echeance' ? tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status) && !t.deadline)
    : tenders.filter(t => t.status === effectiveFilter)
  const searchLower = search.trim().toLowerCase()
  const filtered = !searchLower ? byStatus : byStatus.filter(t =>
    t.title.toLowerCase().includes(searchLower) || t.client.toLowerCase().includes(searchLower))

  const handleCreate = async () => {
    if (!form.title || !form.client) return
    setCreating(true)
    const res = await create({
      title: form.title,
      client: form.client,
      deadline: form.deadline || undefined,
      description: form.description || undefined,
      is_own_client: form.is_own_client,
    })
    setCreating(false)
    if (res.success) {
      setShowModal(false)
      setForm({ title: '', client: '', deadline: '', description: '', is_own_client: false })
      show('AO créé')
      router.push(tenderSetupUrl((res.data as any).id))
    } else show(`Erreur : ${res.error}`)
  }

  const changeStatus = async (tenderId: string, status: TenderStatus) => {
    const res = await markStatus(tenderId, status)
    if (res.success) show('Statut mis à jour')
    else show(`Erreur : ${res.error}`)
  }

  const handleStatusChange = (e: React.MouseEvent | React.ChangeEvent, tenderId: string, status: TenderStatus) => {
    e.stopPropagation()
    return changeStatus(tenderId, status)
  }

  if (loading && tenders.length === 0) return (
    <div className="animate-fade-in">
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[0,1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }} />)}
      </div>
      <Card hover={false}><TableSkeleton rows={8} cols={9} /></Card>
    </div>
  )

  const stats = {
    actifs: tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status)).length,
    gagnes: tenders.filter(t => t.status === 'gagne').length,
    perdus: tenders.filter(t => t.status === 'perdu').length,
    total: tenders.length,
    sansEcheance: tenders.filter(t => ['nouveau', 'en_cours', 'urgence'].includes(t.status) && !t.deadline).length,
  }

  const filters = [
    { key: 'actifs', label: 'Actifs' },
    { key: 'tous', label: 'Tous' },
    { key: 'mes_assignes', label: 'Mes AO assignés' },
    { key: 'gagne', label: 'Gagnés' },
    { key: 'perdu', label: 'Perdus' },
    // Onglet visible seulement quand il sert (arrivée depuis le dashboard, ou des AO sans échéance)
    ...(filter === 'sans_echeance' || stats.sansEcheance > 0 ? [{ key: 'sans_echeance', label: 'Sans échéance' }] : []),
  ]

  const countForFilterKey = (key: string) => {
    if (key === 'actifs') return stats.actifs
    if (key === 'tous') return stats.total
    if (key === 'mes_assignes') return tenders.filter(t => t.assigned_to === currentUserId).length
    if (key === 'sans_echeance') return stats.sansEcheance
    if (key === 'gagne') return stats.gagnes
    if (key === 'perdu') return stats.perdus
    return tenders.filter(t => t.status === key).length
  }
  const visibleFilters = filters.filter(f => view !== 'kanban' || KANBAN_FILTERS.includes(f.key))
  const mainFilters = visibleFilters.filter(f => f.key !== 'sans_echeance')
  const echeanceFilter = visibleFilters.find(f => f.key === 'sans_echeance')

  return (
    <div className="aol-page animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {ToastComponent}

      <div className="aol-head">
        <div>
          <div className="aol-eyebrow">Appels d&apos;offres · {stats.actifs} en cours</div>
          <h1 className="aol-h1">Vos appels d&apos;offres</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="aol-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="text" placeholder="Rechercher un AO, un client…" aria-label="Rechercher un AO" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <span data-tour="tenders-create" style={{ display: 'inline-flex' }}>
            <button type="button" className="aol-new-btn" onClick={() => setShowModal(true)}>+ Nouvel AO</button>
          </span>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Actifs" value={stats.actifs} color="blue" delay={0} />
        <KpiCard label="Gagnés" value={stats.gagnes} color="green" delay={60} />
        <KpiCard label="Perdus" value={stats.perdus} color="amber" delay={120} />
        <KpiCard label="Total" value={stats.total} color="purple" delay={180} />
      </div>

      <div className="aol-filters">
        {mainFilters.map(f => (
          <button key={f.key} type="button" className="aol-pill" aria-pressed={effectiveFilter === f.key} onClick={() => setFilter(f.key)}>
            {f.label} <span>· {countForFilterKey(f.key)}</span>
          </button>
        ))}
        <span style={{ flexGrow: 1 }} />
        {echeanceFilter && (
          <button type="button" className="aol-pill aol-pill--warn" aria-pressed={effectiveFilter === echeanceFilter.key} onClick={() => setFilter(echeanceFilter.key)}>
            {echeanceFilter.label} <span>· {countForFilterKey(echeanceFilter.key)}</span>
          </button>
        )}
        {refreshing && <span style={{ fontSize: 11, color: 'var(--db-text-2)', fontFamily: 'DM Mono, monospace' }}>↻ sync</span>}
        <TenderViewSwitch value={view} onChange={changeView} />
      </div>

      {view === 'cartes' && (
        <MotionConfig reducedMotion="user">
          {filtered.length === 0 ? (
            <Card hover={false}>
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Aucun AO</div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6 rounded-2xl bg-slate-50 p-6 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t, i) => <TenderCard key={t.tender_id} tender={t} index={i} />)}
            </div>
          )}
        </MotionConfig>
      )}

      {view === 'kanban' && <TenderKanban tenders={filtered} onStatusChange={changeStatus} />}

      {view === 'liste' && (
      <>
      {/* Téléphone : lignes compactes (le tableau de 900px obligeait à défiler dans les deux sens). */}
      <div className="tenders-mobile-list">
        {filtered.map(t => {
          const respPct = t.nb_suppliers > 0 ? Math.round((t.nb_responses / t.nb_suppliers) * 100) : 0
          const priorite = PRIORITE_LABEL[t.priorite ?? 'normale'] ?? PRIORITE_LABEL.normale
          return (
            <div
              key={t.tender_id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/tenders/${t.tender_id}`)}
              onKeyDown={e => { if (e.key === 'Enter') router.push(`/tenders/${t.tender_id}`) }}
              style={{ borderRadius: 12, padding: '12px 14px', cursor: 'pointer', ...tenderListRowStyle(t.status) }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{t.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.client}</span>
                {t.priorite && t.priorite !== 'normale' && (
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: priorite.color, fontWeight: 600, flexShrink: 0 }}>{priorite.icon} {priorite.label}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {t.days_remaining !== null && (
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: deadlineColor(t.days_remaining), fontWeight: t.days_remaining <= 3 ? 600 : 400 }}>
                    {t.days_remaining < 0 ? 'Échéance dépassée' : `${t.days_remaining}j`}
                  </span>
                )}
                {!!t.budget_ht && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#34d399' }}>{formatBudget(t.budget_ht)}</span>}
                <Badge color={respPct === 100 ? 'green' : respPct >= 50 ? 'amber' : t.nb_suppliers > 0 ? 'red' : 'gray'}>{t.nb_responses}/{t.nb_suppliers} rép.</Badge>
                <Badge color={t.nb_quotes > 0 ? 'green' : 'gray'}>{t.nb_quotes} devis</Badge>
              </div>
              <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
                <select
                  aria-label={`Statut de ${t.title}`}
                  value={t.status}
                  onChange={e => handleStatusChange(e, t.tender_id, e.target.value as TenderStatus)}
                  style={{ width: '100%', minHeight: 40, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text-primary)', fontFamily: 'DM Sans, system-ui', fontWeight: 500 }}
                >
                  {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Aucun AO</div>
        )}
      </div>
      <div className="aol-table-card tenders-table-view">
        <div className="table-scroll">
        <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr className="aol-thead">
              {[
                'Appel d’offres', 'Priorité', 'Échéance', 'Réponses', 'Meilleur devis',
                ...(showCreatorColumn ? ['Créé par'] : []),
                'Statut', '',
              ].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => {
              const respPct = t.nb_suppliers > 0 ? Math.round((t.nb_responses / t.nb_suppliers) * 100) : 0
              const priorite = PRIORITE_LABEL[t.priorite ?? 'normale'] ?? PRIORITE_LABEL.normale
              const creatorLabel = t.creator_label ?? getTenderCreatorLabel(t, currentUserId, org)
              const assigneeLabel = t.assignee_label ?? getTenderAssigneeLabel(t, currentUserId, org)
              const stage = tenderStageDisplay(t)
              const toneVars = TONE_VARS[stage.tone]
              return (
                <tr key={t.tender_id} onClick={() => router.push(`/tenders/${t.tender_id}`)}
                  className="aol-row animate-fade"
                  style={{ animationDelay: `${i * 30}ms` }}>
                  <td style={{ padding: '14px' }}>
                    <div className="aol-title">{t.title}</div>
                    <div className="aol-client">{t.client}</div>
                    {(creatorLabel || assigneeLabel) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {creatorLabel && (
                          <TenderOriginBadge label={creatorLabel} type="creator" />
                        )}
                        {assigneeLabel && (
                          <TenderOriginBadge label={assigneeLabel} type="assigned" />
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: priorite.color, fontWeight: 600 }}>
                      {priorite.icon} {priorite.label}
                    </span>
                  </td>
                  <td style={{ padding: '14px' }}>
                    <div style={{ fontSize: 14, color: 'var(--db-text)' }}>
                      {t.deadline ? new Date(t.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: t.deadline ? deadlineColor(t.days_remaining) : 'var(--db-orange)' }}>
                      {t.deadline
                        ? (t.days_remaining !== null ? (t.days_remaining < 0 ? 'Échéance dépassée' : `J-${t.days_remaining}`) : '—')
                        : 'Sans échéance'}
                    </div>
                  </td>
                  <td style={{ padding: '14px' }}>
                    {t.nb_suppliers > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="aol-bar-track"><div className="aol-bar-fill" style={{ width: `${respPct}%` }} /></div>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 30, color: 'var(--db-text)' }}>{t.nb_responses}/{t.nb_suppliers}</span>
                      </div>
                    ) : <span style={{ color: 'var(--db-text-2)' }}>—</span>}
                  </td>
                  <td style={{ padding: '14px' }}>
                    {t.min_quote ? (
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--db-green-text)' }}>{formatBudget(t.min_quote)}</span>
                    ) : <span style={{ color: 'var(--db-text-2)' }}>—</span>}
                  </td>
                  {showCreatorColumn && (
                    <td style={{ padding: '14px', fontSize: 11, color: 'var(--db-text-2)', fontFamily: 'DM Sans, system-ui' }}>
                      {creatorLabel ?? creatorColumnLabel(t, currentUserId, org)}
                    </td>
                  )}
                  <td style={{ padding: '14px' }} onClick={e => e.stopPropagation()}>
                    <select
                      aria-label={`Statut de ${t.title}`}
                      value={t.status}
                      onChange={e => handleStatusChange(e, t.tender_id, e.target.value as TenderStatus)}
                      className="aol-status-pill"
                      style={{
                        border: 'none', fontFamily: 'DM Sans, system-ui', cursor: 'pointer',
                        ...toneVars,
                      }}
                    >
                      {STATUS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '14px', color: 'var(--db-text-2)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={tableColCount} style={{ padding: 32, textAlign: 'center', color: 'var(--db-text-2)', fontSize: 12 }}>Aucun AO</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      </>
      )}

      <Suspense fallback={null}>
        <DashboardDeepLink onNew={() => setShowModal(true)} onFilter={setFilter} />
      </Suspense>
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouvel appel d'offres" size="lg">
        <Field label="Titre *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="Ex: Réhabilitation façades R+5" />
        <Field label="Client *" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} placeholder="Ex: Nexity Grand Paris" />
        <Field label="Deadline" value={form.deadline} onChange={v => setForm(f => ({ ...f, deadline: v }))} type="date" />
        <Field label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Description du marché..." />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.is_own_client}
            onChange={e => setForm(f => ({ ...f, is_own_client: e.target.checked }))}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          Je suis le client de ce dossier (pas d&apos;intermédiaire)
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
          <Button variant="primary" onClick={handleCreate} loading={creating}>Créer l&apos;AO</Button>
        </div>
      </Modal>
    </div>
  )
}
