import { describe, expect, it } from 'vitest'
import {
  ageInDays,
  buildPayload,
  classifyInbound,
  displayName,
  isAlertRecipient,
  looksLikeQuestion,
  parisClock,
  shouldSendDigest,
  snippetOf,
  stripQuotedReply,
  subjectLooksLikeQuote,
  type ClassifyInput,
  type PriorityItem,
} from '@/lib/priorities-rules'

describe('stripQuotedReply', () => {
  it('coupe le fil cité après « Le … a écrit : »', () => {
    const t = 'Bonjour, ok pour nous.\n\nLe 12/09/2026 à 10:00, Marie <m@x.fr> a écrit :\n> Pouvez-vous confirmer ?'
    expect(stripQuotedReply(t)).toBe('Bonjour, ok pour nous.')
  })
  it('ignore les lignes citées avec « > »', () => {
    expect(stripQuotedReply('> ancienne question ?\nMerci.')).toBe('Merci.')
  })
  it("coupe à « Message d'origine » et aux en-têtes De :", () => {
    expect(stripQuotedReply("Reçu.\n-----Message d'origine-----\nDe : a@b.fr")).toBe('Reçu.')
    expect(stripQuotedReply('Reçu.\nDe : a@b.fr\nObjet : x')).toBe('Reçu.')
  })
})

describe('looksLikeQuestion', () => {
  it('détecte un point d’interrogation', () => {
    expect(looksLikeQuestion('Quelle couleur pour les menuiseries ?')).toBe(true)
  })
  it('détecte une demande sans point d’interrogation', () => {
    expect(looksLikeQuestion('Merci de nous préciser la hauteur sous plafond.')).toBe(true)
    expect(looksLikeQuestion('Pourriez-vous nous envoyer le plan de l’étage')).toBe(true)
    expect(looksLikeQuestion('Il manque la cote du rez-de-chaussée')).toBe(true)
  })
  it('ne prend pas une URL avec paramètres pour une question', () => {
    expect(looksLikeQuestion('Voici le lien : https://exemple.fr/devis?id=42&x=1')).toBe(false)
  })
  it('ne prend pas la question du fil cité pour celle du fournisseur', () => {
    const t = 'Devis en pièce jointe, cordialement.\n\nLe 1/9/2026, Marie a écrit :\n> Pouvez-vous nous chiffrer ?'
    expect(looksLikeQuestion(t)).toBe(false)
  })
  it('renvoie false pour un texte vide ou nul', () => {
    expect(looksLikeQuestion('')).toBe(false)
    expect(looksLikeQuestion(null)).toBe(false)
  })
})

describe('subjectLooksLikeQuote', () => {
  it('reconnaît devis / offre / chiffrage', () => {
    expect(subjectLooksLikeQuote('RE: Devis menuiseries extérieures')).toBe(true)
    expect(subjectLooksLikeQuote('Proposition commerciale n°42')).toBe(true)
    expect(subjectLooksLikeQuote('Facture FA-2026-0912')).toBe(false)
  })
})

const base: ClassifyInput = {
  isSupplier: false, hasQuoteRow: false, subject: 'Bonjour', hasAttachments: false,
  tenderId: null, markedImportant: false, isAo: false, bodyText: null,
}

describe('classifyInbound', () => {
  it('fournisseur avec devis extrait → quote', () => {
    expect(classifyInbound({ ...base, isSupplier: true, hasQuoteRow: true })).toBe('quote')
  })
  it('fournisseur, PDF joint, sujet « devis » sur un AO → quote même sans prix extrait', () => {
    expect(classifyInbound({ ...base, isSupplier: true, tenderId: 't1', hasAttachments: true, subject: 'Notre devis' })).toBe('quote')
  })
  it('fournisseur sans devis : demande le corps pour juger si c’est une question', () => {
    expect(classifyInbound({ ...base, isSupplier: true })).toBe('needs_body')
  })
  it('fournisseur avec question dans le corps → question', () => {
    expect(classifyInbound({ ...base, isSupplier: true, bodyText: 'Quelle dimension ?' })).toBe('question')
  })
  it('simple accusé de réception fournisseur → rien à faire', () => {
    expect(classifyInbound({ ...base, isSupplier: true, bodyText: 'Bien reçu, merci.' })).toBeNull()
  })
  it('mail important non fournisseur → important', () => {
    expect(classifyInbound({ ...base, markedImportant: true })).toBe('important')
  })
  it('AO détecté non encore créé → ao_to_create ; déjà lié → rien', () => {
    expect(classifyInbound({ ...base, isAo: true })).toBe('ao_to_create')
    expect(classifyInbound({ ...base, isAo: true, tenderId: 't1' })).toBeNull()
  })
  it('mail ordinaire → rien', () => {
    expect(classifyInbound(base)).toBeNull()
  })
})

function item(over: Partial<PriorityItem>): PriorityItem {
  return {
    emailId: 'e', kind: 'important', subject: 's', fromName: 'f', fromAddress: 'f@x.fr', receivedAt: '2026-09-01T00:00:00Z',
    ageDays: 0, tenderId: null, tenderTitle: null, supplierName: null, snippet: '', price: null, isBestPrice: false, ...over,
  }
}

describe('buildPayload', () => {
  it('trie devis → questions → importants → AO, le plus ancien d’abord, et compte par type', () => {
    const p = buildPayload([
      item({ emailId: 'a', kind: 'important', ageDays: 5 }),
      item({ emailId: 'b', kind: 'quote', ageDays: 1 }),
      item({ emailId: 'c', kind: 'question', ageDays: 2 }),
      item({ emailId: 'd', kind: 'quote', ageDays: 4 }),
    ])
    expect(p.items.map(i => i.emailId)).toEqual(['d', 'b', 'c', 'a'])
    expect(p.counts).toEqual({ quote: 2, question: 1, important: 1, ao_to_create: 0 })
    expect(p.total).toBe(4)
  })
})

describe('helpers d’affichage', () => {
  it('displayName garde le nom, sinon l’adresse', () => {
    expect(displayName('Jean Durand <j@x.fr>')).toBe('Jean Durand')
    expect(displayName('"Alu Concept" <a@x.fr>')).toBe('Alu Concept')
    expect(displayName('<a@x.fr>')).toBe('a@x.fr')
    expect(displayName(null)).toBe('Expéditeur inconnu')
  })
  it('snippetOf ignore le fil cité et tronque', () => {
    expect(snippetOf('Bonjour\n> vieux\nMerci')).toBe('Bonjour Merci')
    expect(snippetOf('x'.repeat(300)).length).toBe(140)
  })
  it('ageInDays', () => {
    const now = new Date('2026-09-10T12:00:00Z').getTime()
    expect(ageInDays('2026-09-07T12:00:00Z', now)).toBe(3)
    expect(ageInDays('invalide', now)).toBe(0)
  })
})

describe('isAlertRecipient', () => {
  const t = { user_id: 'creator', assigned_to: 'resp' }
  it('le créateur et le responsable reçoivent toujours', () => {
    expect(isAlertRecipient(t, 'creator', { isOrgOwner: false, urgent: false })).toBe(true)
    expect(isAlertRecipient(t, 'resp', { isOrgOwner: false, urgent: false })).toBe(true)
  })
  it('le propriétaire de l’organisation ne reçoit qu’en cas d’urgence', () => {
    expect(isAlertRecipient(t, 'owner', { isOrgOwner: true, urgent: false })).toBe(false)
    expect(isAlertRecipient(t, 'owner', { isOrgOwner: true, urgent: true })).toBe(true)
  })
  it('un autre membre ne reçoit rien, même en urgence', () => {
    expect(isAlertRecipient(t, 'other', { isOrgOwner: false, urgent: true })).toBe(false)
  })
})

describe('récap du matin', () => {
  // 08:30 à Paris (UTC+2 en septembre) un mardi
  const tuesday8h = new Date('2026-09-22T06:30:00Z')
  it('parisClock donne heure, date et jour à Paris', () => {
    expect(parisClock(tuesday8h)).toEqual({ hour: 8, date: '2026-09-22', weekday: 2 })
  })
  const on = { digest_enabled: true, digest_hour: 8, digest_last_sent_on: null as string | null }
  it('envoie à l’heure choisie un jour ouvré', () => {
    expect(shouldSendDigest(on, parisClock(tuesday8h))).toBe(true)
  })
  it('n’envoie pas avant l’heure choisie', () => {
    expect(shouldSendDigest({ ...on, digest_hour: 9 }, parisClock(tuesday8h))).toBe(false)
  })
  it('rattrape un passage manqué, mais pas au-delà de 3 h', () => {
    expect(shouldSendDigest({ ...on, digest_hour: 6 }, parisClock(tuesday8h))).toBe(true)
    expect(shouldSendDigest({ ...on, digest_hour: 3 }, parisClock(tuesday8h))).toBe(false)
  })
  it('une seule fois par jour', () => {
    expect(shouldSendDigest({ ...on, digest_last_sent_on: '2026-09-22' }, parisClock(tuesday8h))).toBe(false)
  })
  it('pas le week-end, pas si désactivé', () => {
    const saturday = new Date('2026-09-26T06:30:00Z')
    expect(shouldSendDigest(on, parisClock(saturday))).toBe(false)
    expect(shouldSendDigest({ ...on, digest_enabled: false }, parisClock(tuesday8h))).toBe(false)
  })
})
