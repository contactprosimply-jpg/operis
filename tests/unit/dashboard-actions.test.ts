import { describe, expect, it } from 'vitest'
import { THEMES } from '@/lib/theme'
import {
  buildDashboardActions,
  byUrgency,
  computeStats,
  formatDeadline,
  headline,
  pendingRelaunchLabel,
  pickActiveTenders,
  responseRateLabel,
  responseSummary,
  stripUrgentLabel,
  wonLabel,
  type DashboardExtra,
  type DashboardTender,
} from '@/lib/dashboard-actions'

function tender(over: Partial<DashboardTender> & { tender_id: string }): DashboardTender {
  return {
    title: `AO ${over.tender_id}`, client: 'Mairie', status: 'en_cours', deadline: '2026-10-12',
    days_remaining: 10, nb_suppliers: 2, nb_responses: 1, ...over,
  }
}

const noExtra: DashboardExtra = { dueRelaunches: [], pendingRelaunchConfirmations: 0, unlinkedQuotes: 0, unlinkedAoMails: 0, mailEnabled: true }

describe('buildDashboardActions', () => {
  it('liste vide quand tout est à jour', () => {
    expect(buildDashboardActions({ tenders: [tender({ tender_id: 'a' })], extra: noExtra })).toEqual([])
  })

  it('a) relance : rouge, « Urgent », bouton Relancer avec les fournisseurs en retard', () => {
    const [a] = buildDashboardActions({
      tenders: [tender({ tender_id: 'a', title: 'École Moulin' })],
      extra: { ...noExtra, dueRelaunches: [{ tenderId: 'a', supplierIds: ['s1', 's2', 's3'] }] },
    })
    expect(a).toMatchObject({
      tone: 'red', icon: 'relance', title: 'Relancer les fournisseurs — École Moulin',
      context: '3 fournisseurs consultés, aucune réponse', tag: { label: 'Urgent', tone: 'red' },
      cta: { kind: 'relaunch', label: 'Relancer', tenderId: 'a', supplierIds: ['s1', 's2', 's3'] },
    })
  })

  it('a) au singulier : « Relancer le fournisseur … 1 fournisseur consulté »', () => {
    const [a] = buildDashboardActions({
      tenders: [tender({ tender_id: 'a', title: 'X' })],
      extra: { ...noExtra, dueRelaunches: [{ tenderId: 'a', supplierIds: ['s1'] }] },
    })
    expect(a.title).toBe('Relancer le fournisseur — X')
    expect(a.context).toBe('1 fournisseur consulté, aucune réponse')
  })

  it('a) ignore les AO non actifs et les relances sans fournisseur', () => {
    const actions = buildDashboardActions({
      tenders: [tender({ tender_id: 'a', status: 'gagne' }), tender({ tender_id: 'b' })],
      extra: { ...noExtra, dueRelaunches: [{ tenderId: 'a', supplierIds: ['s'] }, { tenderId: 'b', supplierIds: [] }] },
    })
    expect(actions).toEqual([])
  })

  it('b) AO sans fournisseur : orange, « Aujourd’hui », bouton Choisir vers la sélection', () => {
    const [b] = buildDashboardActions({ tenders: [tender({ tender_id: 'a', title: 'Gymnase', nb_suppliers: 0, nb_responses: 0 })], extra: noExtra })
    expect(b).toMatchObject({
      tone: 'orange', icon: 'truck', title: 'Lancer la consultation — Gymnase',
      context: "Aucun fournisseur consulté pour l'instant", tag: { label: "Aujourd'hui", tone: 'orange' },
      cta: { kind: 'link', label: 'Choisir', href: '/tenders/a?action=add-supplier' },
    })
  })

  it('c) devis à rattacher, d) mails d’AO, e) sans date limite : libellés, tags et liens', () => {
    const actions = buildDashboardActions({
      tenders: [tender({ tender_id: 'a', deadline: null, days_remaining: null }), tender({ tender_id: 'b', deadline: null, days_remaining: null })],
      extra: { ...noExtra, unlinkedQuotes: 3, unlinkedAoMails: 1 },
    })
    expect(actions.map(a => a.id)).toEqual(['devis', 'mails-ao', 'sans-echeance'])
    expect(actions[0]).toMatchObject({ title: 'Rattacher 3 devis reçus', context: 'Arrivés dans la messagerie, sans AO associé', tone: 'orange', icon: 'document', cta: { label: 'Trier les devis', href: '/mail?filter=devis' } })
    expect(actions[1]).toMatchObject({ title: "Transformer 1 mail d'appel d'offres", tone: 'accent', icon: 'mail', tag: { label: 'Cette semaine', tone: 'neutral' }, cta: { label: 'Voir les mails', href: '/mail?filter=ao' } })
    expect(actions[2]).toMatchObject({ title: 'Ajouter une date limite à 2 AO', context: 'Sans échéance, aucune alerte ne peut vous prévenir', icon: 'calendar', cta: { label: 'Compléter', href: '/tenders?filter=sans_echeance' } })
  })

  it('ordre : relances, consultations, devis, mails d’AO, dates limites', () => {
    const actions = buildDashboardActions({
      tenders: [tender({ tender_id: 'a' }), tender({ tender_id: 'b', nb_suppliers: 0 }), tender({ tender_id: 'c', deadline: null, days_remaining: null })],
      extra: { ...noExtra, dueRelaunches: [{ tenderId: 'a', supplierIds: ['s'] }], unlinkedQuotes: 1, unlinkedAoMails: 1 },
    })
    expect(actions.map(a => a.id.split(':')[0])).toEqual(['relance', 'consultation', 'devis', 'mails-ao', 'sans-echeance'])
  })

  it('trie les relances par échéance (la plus proche d’abord)', () => {
    const actions = buildDashboardActions({
      tenders: [tender({ tender_id: 'loin', days_remaining: 30 }), tender({ tender_id: 'proche', days_remaining: 2 })],
      extra: { ...noExtra, dueRelaunches: [{ tenderId: 'loin', supplierIds: ['s'] }, { tenderId: 'proche', supplierIds: ['s'] }] },
    })
    expect(actions.map(a => a.id)).toEqual(['relance:proche', 'relance:loin'])
  })

  it('messagerie désactivée : plus de devis ni de mails d’AO, et « Relancer » devient « Voir l’AO »', () => {
    const actions = buildDashboardActions({
      tenders: [tender({ tender_id: 'a' })],
      extra: { ...noExtra, mailEnabled: false, unlinkedQuotes: 5, unlinkedAoMails: 5, dueRelaunches: [{ tenderId: 'a', supplierIds: ['s'] }] },
    })
    expect(actions.map(a => a.id)).toEqual(['relance:a'])
    expect(actions[0].cta).toEqual({ kind: 'link', label: "Voir l'AO", href: '/tenders/a' })
  })
})

describe('chiffres', () => {
  const tenders = [
    tender({ tender_id: '1', nb_suppliers: 2, nb_responses: 1, days_remaining: 2 }),
    tender({ tender_id: '2', nb_suppliers: 2, nb_responses: 0, days_remaining: 20 }),
    tender({ tender_id: '3', status: 'gagne', nb_suppliers: 0, nb_responses: 0, days_remaining: null }),
    tender({ tender_id: '4', status: 'gagne', nb_suppliers: 0, nb_responses: 0, days_remaining: null }),
    tender({ tender_id: '5', status: 'perdu', nb_suppliers: 0, nb_responses: 0, days_remaining: null }),
  ]
  it('computeStats', () => {
    expect(computeStats(tenders)).toEqual({ actifs: 2, urgents: 1, totalResp: 1, totalSupp: 4, tauxReponse: 25, gagnes: 2, tauxReussite: 40 })
  })
  it('libellés du bandeau', () => {
    expect(stripUrgentLabel(0)).toEqual({ text: 'aucune urgence', tone: 'green' })
    expect(stripUrgentLabel(1)).toEqual({ text: '1 urgent', tone: 'red' })
    expect(stripUrgentLabel(3)).toEqual({ text: '3 urgents', tone: 'red' })
    expect(responseRateLabel({ totalResp: 1, totalSupp: 4 })).toBe('1 fournisseur sur 4')
    expect(responseRateLabel({ totalResp: 2, totalSupp: 4 })).toBe('2 fournisseurs sur 4')
    expect(responseRateLabel({ totalResp: 0, totalSupp: 0 })).toBe('aucun fournisseur consulté')
    expect(wonLabel(1)).toBe('1 AO gagné')
    expect(wonLabel(3)).toBe('3 AO gagnés')
  })
  it('taux à zéro sans données', () => {
    expect(computeStats([])).toMatchObject({ actifs: 0, tauxReponse: 0, tauxReussite: 0 })
  })
})

describe('titre de page', () => {
  it('compte les actions, singulier et pluriel', () => {
    expect(headline('Marie', 3)).toBe("Bonjour Marie, 3 actions pour aujourd'hui")
    expect(headline('Marie', 1)).toBe("Bonjour Marie, 1 action pour aujourd'hui")
  })
  it('« rien d’urgent » quand N = 0', () => {
    expect(headline('Marie', 0)).toBe("Bonjour Marie, rien d'urgent aujourd'hui")
  })
})

describe('carte « AO en cours »', () => {
  it('garde les 4 AO actifs les plus urgents, sans échéance en dernier', () => {
    const list = [
      tender({ tender_id: 'sans', days_remaining: null, deadline: null }),
      tender({ tender_id: 'j20', days_remaining: 20 }),
      tender({ tender_id: 'j2', days_remaining: 2 }),
      tender({ tender_id: 'depasse', days_remaining: -1 }),
      tender({ tender_id: 'j5', days_remaining: 5 }),
      tender({ tender_id: 'gagne', status: 'gagne', days_remaining: 0 }),
    ]
    expect(pickActiveTenders(list).map(t => t.tender_id)).toEqual(['depasse', 'j2', 'j5', 'j20'])
  })
  it('tri stable à égalité (par titre)', () => {
    expect([tender({ tender_id: 'b', title: 'Béta' }), tender({ tender_id: 'a', title: 'Alpha' })].sort(byUrgency).map(t => t.tender_id)).toEqual(['a', 'b'])
  })
  it('ligne fournisseurs / réponses, alerte si 0 réponse avec au moins 1 fournisseur', () => {
    expect(responseSummary({ nb_suppliers: 4, nb_responses: 2 })).toEqual({ suppliers: '4 fournisseurs', responses: '2/4 réponses', alert: false })
    expect(responseSummary({ nb_suppliers: 1, nb_responses: 1 })).toEqual({ suppliers: '1 fournisseur', responses: '1/1 réponse', alert: false })
    expect(responseSummary({ nb_suppliers: 3, nb_responses: 0 }).alert).toBe(true)
    expect(responseSummary({ nb_suppliers: 0, nb_responses: 0 }).alert).toBe(false)
  })
  it('date limite : formatée, ou null', () => {
    expect(formatDeadline('2026-10-12')).toMatch(/12 oct\.? 2026/)
    expect(formatDeadline(null)).toBeNull()
    expect(formatDeadline('pas-une-date')).toBeNull()
  })
})

describe('carte sombre', () => {
  it('accorde le nombre de relances en attente', () => {
    expect(pendingRelaunchLabel(0)).toBe('Aucune relance en attente de votre feu vert')
    expect(pendingRelaunchLabel(1)).toBe('1 relance en attente de votre feu vert')
    expect(pendingRelaunchLabel(4)).toBe('4 relances en attente de votre feu vert')
  })
})

describe('jetons de thème du dashboard', () => {
  const tokens = (id: string) => Object.keys(THEMES.find(t => t.id === id)!.vars).filter(k => k.startsWith('--db-')).sort()
  it('tous les thèmes définissent exactement les mêmes jetons', () => {
    const light = tokens('light')
    expect(light.length).toBeGreaterThan(15)
    for (const t of THEMES) expect(tokens(t.id)).toEqual(light)
  })
  it('le thème clair reproduit la maquette au hexa près', () => {
    const v = THEMES.find(t => t.id === 'light')!.vars as Record<string, string>
    expect(v).toMatchObject({
      '--db-page': '#EEF2F7', '--db-card': '#FFFFFF', '--db-border': '#E2E8F0', '--db-sep': '#EEF2F7',
      '--db-text': '#0F1B3D', '--db-text-2': '#64748B', '--db-accent': '#4F5BD5', '--db-accent-bg': '#EEF0FC',
      '--db-orange': '#B45309', '--db-orange-bg': '#FDF1E4', '--db-red': '#B42318', '--db-red-bg': '#FCECEC',
      '--db-green': '#0F8A5F', '--db-tag': '#475569', '--db-tag-bg': '#EEF2F7', '--db-btn-border': '#D5DCE8',
      '--db-dark': '#0F1B3D', '--db-dark-label': '#A5B0D6', '--db-dark-text': '#C9D1EA',
    })
  })
})
