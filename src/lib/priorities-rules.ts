// Règles pures (sans base de données) qui décident ce qui « reste à traiter » : testables seules.

export type PriorityKind = 'quote' | 'question' | 'important' | 'ao_to_create'

export interface PriorityItem {
  emailId: string
  kind: PriorityKind
  subject: string
  fromName: string
  fromAddress: string
  receivedAt: string
  ageDays: number
  tenderId: string | null
  tenderTitle: string | null
  supplierName: string | null
  snippet: string
  /** Montant HT du devis, quand il a été extrait. */
  price: number | null
  /** Vrai si c'est le devis le moins cher reçu sur cet AO. */
  isBestPrice: boolean
}

export interface PriorityPayload {
  items: PriorityItem[]
  counts: Record<PriorityKind, number>
  total: number
}

export const PRIORITY_KIND_ORDER: PriorityKind[] = ['quote', 'question', 'important', 'ao_to_create']

export const PRIORITY_KIND_LABEL: Record<PriorityKind, string> = {
  quote: 'Devis reçus',
  question: 'Questions des fournisseurs',
  important: 'Mails importants',
  ao_to_create: 'AO détectés à créer',
}

// Début de la partie citée d'une réponse (« Le … a écrit : », message d'origine, en-têtes De :/From :).
const QUOTE_START = /^(le .{5,90} a écrit\s*:|on .{5,90} wrote\s*:|-{2,}\s*(message d.origine|original message|forwarded message|message transféré)|de\s*:\s.+@|from\s*:\s.+@)/i

/** Ne garde que ce que l'expéditeur vient d'écrire (sans le fil cité en dessous). */
export function stripQuotedReply(text: string): string {
  const out: string[] = []
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const t = line.trim()
    if (QUOTE_START.test(t)) break
    if (t.startsWith('>')) continue
    out.push(line)
  }
  return out.join('\n').trim()
}

// Formules de demande sans point d'interrogation (« merci de nous préciser… »).
const REQUEST_PHRASES = new RegExp(
  '(pouvez[- ]vous|pourriez[- ]vous|pouvons[- ]nous|pourrions[- ]nous|auriez[- ]vous|serait[- ]il possible'
  + '|merci de (bien )?(nous )?(préciser|confirmer|indiquer|transmettre|communiquer|envoyer|revenir|faire savoir)'
  + '|faites[- ]nous savoir|dites[- ]nous|nous aurions besoin|il nous manque|il manque)',
  'i',
)

/** Le fournisseur pose-t-il une question / demande-t-il une précision ? */
export function looksLikeQuestion(text: string | null | undefined): boolean {
  if (!text) return false
  // Les URLs contiennent souvent « ? » (paramètres) : ce ne sont pas des questions.
  const body = stripQuotedReply(text).replace(/https?:\/\/\S+/gi, ' ')
  if (!body.trim()) return false
  return body.includes('?') || REQUEST_PHRASES.test(body)
}

const QUOTE_SUBJECT = /\b(devis|offre de prix|proposition (commerciale|de prix|financi[eè]re)|chiffrage|cotation|bordereau de prix)\b/i

/** Sujet évoquant un devis (repli quand aucun prix n'a pu être extrait du PDF). */
export function subjectLooksLikeQuote(subject: string | null | undefined): boolean {
  return QUOTE_SUBJECT.test(subject ?? '')
}

export function snippetOf(text: string | null | undefined, max = 140): string {
  const body = stripQuotedReply(text ?? '').replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim()
  return body.length <= max ? body : `${body.slice(0, max - 1)}…`
}

export function displayName(fromAddress: string | null | undefined): string {
  const raw = (fromAddress ?? '').trim()
  const name = raw.split('<')[0].replace(/["']/g, '').trim()
  return name || raw.replace(/[<>]/g, '') || 'Expéditeur inconnu'
}

export function ageInDays(receivedAt: string, now = Date.now()): number {
  const t = new Date(receivedAt).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / 86400000))
}

export interface ClassifyInput {
  isSupplier: boolean
  hasQuoteRow: boolean
  subject: string | null
  hasAttachments: boolean
  tenderId: string | null
  markedImportant: boolean
  isAo: boolean
  /** Corps du mail — null tant qu'il n'a pas été chargé. */
  bodyText: string | null
}

/**
 * Décide dans quelle catégorie tombe un mail reçu, ou null s'il n'y a rien à faire.
 * Retourne 'needs_body' quand la réponse dépend du corps du mail (question ?) qu'on ne charge
 * que pour les candidats restants, afin de ne pas rapatrier des centaines de corps de mails.
 */
export function classifyInbound(i: ClassifyInput): PriorityKind | 'needs_body' | null {
  if (i.isSupplier) {
    if (i.hasQuoteRow) return 'quote'
    if (i.tenderId && i.hasAttachments && subjectLooksLikeQuote(i.subject)) return 'quote'
    if (i.bodyText === null) return 'needs_body'
    if (looksLikeQuestion(i.bodyText)) return 'question'
    return i.markedImportant ? 'important' : null
  }
  if (i.markedImportant) return 'important'
  if (i.isAo && !i.tenderId) return 'ao_to_create'
  return null
}

const COUNT_LABEL: Record<PriorityKind, [string, string]> = {
  quote: ['devis reçu', 'devis reçus'],
  question: ['question de fournisseur', 'questions de fournisseurs'],
  important: ['mail important', 'mails importants'],
  ao_to_create: ['AO à créer', 'AO à créer'],
}

/** « 2 devis reçus · 1 question de fournisseur » — accordé au singulier/pluriel. */
export function describeCounts(counts: Record<PriorityKind, number>): string {
  return PRIORITY_KIND_ORDER
    .filter(k => counts[k] > 0)
    .map(k => `${counts[k]} ${COUNT_LABEL[k][counts[k] > 1 ? 1 : 0]}`)
    .join(' · ')
}

export function emptyCounts(): Record<PriorityKind, number> {
  return { quote: 0, question: 0, important: 0, ao_to_create: 0 }
}

/** Trie (devis d'abord, puis questions…, le plus ancien en premier : c'est ce qu'on risque d'oublier). */
export function buildPayload(items: PriorityItem[]): PriorityPayload {
  const order = (k: PriorityKind) => PRIORITY_KIND_ORDER.indexOf(k)
  const sorted = [...items].sort((a, b) => order(a.kind) - order(b.kind) || b.ageDays - a.ageDays)
  const counts = emptyCounts()
  for (const it of sorted) counts[it.kind]++
  return { items: sorted, counts, total: sorted.length }
}

// ── Destinataires des alertes d'AO ─────────────────────────────────────────────

/**
 * Qui reçoit les alertes d'un AO : le responsable et le créateur ; le propriétaire de
 * l'organisation seulement en copie quand l'échéance est urgente.
 */
export function isAlertRecipient(
  tender: { user_id: string; assigned_to?: string | null },
  userId: string,
  opts: { isOrgOwner: boolean; urgent: boolean },
): boolean {
  if (tender.user_id === userId || tender.assigned_to === userId) return true
  return opts.isOrgOwner && opts.urgent
}

// ── Heure du récap ─────────────────────────────────────────────────────────────

export const DIGEST_TIMEZONE = 'Europe/Paris'

/** Heure (0-23) et date (AAAA-MM-JJ) à Paris pour un instant donné. */
export function parisClock(now = new Date()): { hour: number; date: string; weekday: number } {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: DIGEST_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(now))
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: DIGEST_TIMEZONE }).format(now)
  const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone: DIGEST_TIMEZONE, weekday: 'short' }).format(now)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName)
  return { hour, date, weekday }
}

/** Rattrapage si un passage du cron a été manqué : on envoie jusqu'à 3 h après l'heure choisie. */
export const DIGEST_CATCHUP_HOURS = 3

/** Le récap part les jours ouvrés (lundi-vendredi), à l'heure choisie, une seule fois par jour. */
export function shouldSendDigest(
  s: { digest_enabled: boolean; digest_hour: number; digest_last_sent_on: string | null },
  clock: { hour: number; date: string; weekday: number },
): boolean {
  if (!s.digest_enabled) return false
  if (clock.weekday === 0 || clock.weekday === 6) return false
  if (s.digest_last_sent_on === clock.date) return false
  return clock.hour >= s.digest_hour && clock.hour <= s.digest_hour + DIGEST_CATCHUP_HOURS
}
