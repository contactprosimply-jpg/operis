// Logique pure du dashboard « À faire aujourd'hui » (sans base de données, testable seule).
import type { TenderStats } from '@/types/database'

export const ACTIVE_TENDER_STATUSES = ['nouveau', 'en_cours', 'urgence'] as const

export type DashboardTender = Pick<
  TenderStats,
  'tender_id' | 'title' | 'client' | 'status' | 'deadline' | 'days_remaining' | 'nb_suppliers' | 'nb_responses'
>

/** Fournisseurs d'un AO qui n'ont pas répondu après le délai de relance (calculé côté serveur). */
export interface DueRelaunch {
  tenderId: string
  supplierIds: string[]
}

/** Ce que la route /api/dashboard/actions renvoie en plus de la liste des AO. */
export interface DashboardExtra {
  dueRelaunches: DueRelaunch[]
  /** Relances en attente du feu vert de l'utilisateur (notifications « relaunch_confirm » non lues). */
  pendingRelaunchConfirmations: number
  unlinkedQuotes: number
  unlinkedAoMails: number
  mailEnabled: boolean
}

export type ActionTone = 'red' | 'orange' | 'accent'
export type ActionIcon = 'relance' | 'truck' | 'document' | 'mail' | 'calendar'
export type TagTone = 'red' | 'orange' | 'neutral'

export type ActionCta =
  | { kind: 'relaunch'; label: string; tenderId: string; supplierIds: string[] }
  | { kind: 'link'; label: string; href: string }

export interface DashboardAction {
  id: string
  tone: ActionTone
  icon: ActionIcon
  title: string
  context: string
  tag: { label: string; tone: TagTone }
  cta: ActionCta
}

export const isActiveTender = (t: Pick<DashboardTender, 'status'>): boolean =>
  (ACTIVE_TENDER_STATUSES as readonly string[]).includes(t.status)

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one)

/** Échéance la plus proche d'abord (dépassées comprises), sans échéance en dernier, puis titre. */
export function byUrgency(a: DashboardTender, b: DashboardTender): number {
  const da = a.days_remaining ?? Number.POSITIVE_INFINITY
  const db = b.days_remaining ?? Number.POSITIVE_INFINITY
  if (da !== db) return da - db
  return a.title.localeCompare(b.title, 'fr')
}

export interface BuildActionsInput {
  tenders: DashboardTender[]
  extra: DashboardExtra
}

/**
 * La liste « À faire aujourd'hui », dans l'ordre : relances (rouge), consultations à lancer,
 * devis à rattacher, mails d'AO, dates limites manquantes. Une action à zéro n'apparaît pas.
 * Sans messagerie : plus de devis / mails d'AO, et « Relancer » (qui envoie un e-mail) devient
 * « Voir l'AO » — la relance se fait alors à la main sur la fiche.
 */
export function buildDashboardActions({ tenders, extra }: BuildActionsInput): DashboardAction[] {
  const actions: DashboardAction[] = []
  const active = tenders.filter(isActiveTender)
  const byId = new Map(active.map(t => [t.tender_id, t]))

  // a) relances : AO les plus proches de l'échéance d'abord
  const due = extra.dueRelaunches
    .map(d => ({ d, tender: byId.get(d.tenderId) }))
    .filter((x): x is { d: DueRelaunch; tender: DashboardTender } => !!x.tender && x.d.supplierIds.length > 0)
    .sort((x, y) => byUrgency(x.tender, y.tender))
  for (const { d, tender } of due) {
    const n = d.supplierIds.length
    actions.push({
      id: `relance:${tender.tender_id}`,
      tone: 'red',
      icon: 'relance',
      title: `${plural(n, 'Relancer le fournisseur', 'Relancer les fournisseurs')} — ${tender.title}`,
      context: `${n} ${plural(n, 'fournisseur consulté', 'fournisseurs consultés')}, aucune réponse`,
      tag: { label: 'Urgent', tone: 'red' },
      cta: extra.mailEnabled
        ? { kind: 'relaunch', label: 'Relancer', tenderId: tender.tender_id, supplierIds: d.supplierIds }
        : { kind: 'link', label: "Voir l'AO", href: `/tenders/${tender.tender_id}` },
    })
  }

  // b) AO sans aucun fournisseur
  for (const tender of active.filter(t => (t.nb_suppliers ?? 0) === 0).sort(byUrgency)) {
    actions.push({
      id: `consultation:${tender.tender_id}`,
      tone: 'orange',
      icon: 'truck',
      title: `Lancer la consultation — ${tender.title}`,
      context: "Aucun fournisseur consulté pour l'instant",
      tag: { label: "Aujourd'hui", tone: 'orange' },
      cta: { kind: 'link', label: 'Choisir', href: `/tenders/${tender.tender_id}?action=add-supplier` },
    })
  }

  // c) devis reçus non rattachés (messagerie)
  if (extra.mailEnabled && extra.unlinkedQuotes > 0) {
    const n = extra.unlinkedQuotes
    actions.push({
      id: 'devis',
      tone: 'orange',
      icon: 'document',
      title: `Rattacher ${n} ${plural(n, 'devis reçu', 'devis reçus')}`,
      context: 'Arrivés dans la messagerie, sans AO associé',
      tag: { label: "Aujourd'hui", tone: 'orange' },
      cta: { kind: 'link', label: 'Trier les devis', href: '/mail?filter=devis' },
    })
  }

  // d) mails d'appel d'offres détectés mais pas créés en AO (messagerie)
  if (extra.mailEnabled && extra.unlinkedAoMails > 0) {
    const n = extra.unlinkedAoMails
    actions.push({
      id: 'mails-ao',
      tone: 'accent',
      icon: 'mail',
      title: `Transformer ${n} ${plural(n, "mail d'appel d'offres", "mails d'appel d'offres")}`,
      context: 'Détectés automatiquement, pas encore créés en AO',
      tag: { label: 'Cette semaine', tone: 'neutral' },
      cta: { kind: 'link', label: 'Voir les mails', href: '/mail?filter=ao' },
    })
  }

  // e) AO actifs sans date limite
  const withoutDeadline = active.filter(t => !t.deadline)
  if (withoutDeadline.length > 0) {
    const n = withoutDeadline.length
    actions.push({
      id: 'sans-echeance',
      tone: 'accent',
      icon: 'calendar',
      title: `Ajouter une date limite à ${n} AO`,
      context: 'Sans échéance, aucune alerte ne peut vous prévenir',
      tag: { label: 'Cette semaine', tone: 'neutral' },
      cta: { kind: 'link', label: 'Compléter', href: '/tenders?filter=sans_echeance' },
    })
  }

  return actions
}

export interface DashboardStats {
  actifs: number
  urgents: number
  totalResp: number
  totalSupp: number
  tauxReponse: number
  gagnes: number
  tauxReussite: number
}

/** Mêmes définitions que l'ancien dashboard : taux de réponse et de réussite sur tous les AO. */
export function computeStats(tenders: DashboardTender[]): DashboardStats {
  const actifs = tenders.filter(isActiveTender)
  const urgents = actifs.filter(t => t.days_remaining !== null && t.days_remaining <= 3).length
  const totalResp = tenders.reduce((a, t) => a + (t.nb_responses ?? 0), 0)
  const totalSupp = tenders.reduce((a, t) => a + (t.nb_suppliers ?? 0), 0)
  const gagnes = tenders.filter(t => t.status === 'gagne').length
  return {
    actifs: actifs.length,
    urgents,
    totalResp,
    totalSupp,
    tauxReponse: totalSupp > 0 ? Math.round((totalResp / totalSupp) * 100) : 0,
    gagnes,
    tauxReussite: tenders.length > 0 ? Math.round((gagnes / tenders.length) * 100) : 0,
  }
}

export function stripUrgentLabel(urgents: number): { text: string; tone: 'red' | 'green' } {
  return urgents > 0
    ? { text: `${urgents} ${plural(urgents, 'urgent', 'urgents')}`, tone: 'red' }
    : { text: 'aucune urgence', tone: 'green' }
}

export function responseRateLabel(s: Pick<DashboardStats, 'totalResp' | 'totalSupp'>): string {
  if (s.totalSupp === 0) return 'aucun fournisseur consulté'
  return `${s.totalResp} ${plural(s.totalResp, 'fournisseur', 'fournisseurs')} sur ${s.totalSupp}`
}

export function wonLabel(gagnes: number): string {
  return `${gagnes} ${plural(gagnes, 'AO gagné', 'AO gagnés')}`
}

/** « Bonjour Marie, 3 actions pour aujourd'hui » / « …rien d'urgent aujourd'hui ». */
export function headline(firstName: string, actionCount: number): string {
  if (actionCount === 0) return `Bonjour ${firstName}, rien d'urgent aujourd'hui`
  return `Bonjour ${firstName}, ${actionCount} ${plural(actionCount, 'action', 'actions')} pour aujourd'hui`
}

/** Les AO actifs les plus urgents, pour la carte « AO en cours ». */
export function pickActiveTenders(tenders: DashboardTender[], max = 4): DashboardTender[] {
  return tenders.filter(isActiveTender).sort(byUrgency).slice(0, max)
}

export function responseSummary(t: Pick<DashboardTender, 'nb_suppliers' | 'nb_responses'>): {
  suppliers: string
  responses: string
  alert: boolean
} {
  const s = t.nb_suppliers ?? 0
  const r = t.nb_responses ?? 0
  return {
    suppliers: `${s} ${plural(s, 'fournisseur', 'fournisseurs')}`,
    responses: `${r}/${s} ${plural(r, 'réponse', 'réponses')}`,
    alert: s > 0 && r === 0,
  }
}

/** « 12 oct. 2026 » ou null quand il n'y a pas de date limite. */
export function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null
  // « 2026-10-12 » (date seule) est lue en UTC par Date : on la construit en local pour ne pas afficher la veille.
  const m = /^(d{4})-(d{2})-(d{2})/.exec(deadline)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(deadline)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function pendingRelaunchLabel(n: number): string {
  if (n <= 0) return 'Aucune relance en attente de votre feu vert'
  return `${n} ${plural(n, 'relance', 'relances')} en attente de votre feu vert`
}
