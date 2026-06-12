import type { SupabaseClient } from '@supabase/supabase-js'
import { messageIdLookupVariants, normalizeMessageId } from '@/lib/mail-message-id'

export function cleanEmailSubject(subject: string): string {
  return subject
    .replace(/^(re:|fwd:|tr:|fw:|aw:)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function parseReferencesHeader(raw: string | string[] | undefined): string[] {
  if (!raw) return []
  const parts = Array.isArray(raw) ? raw : [raw]
  const ids: string[] = []
  for (const part of parts) {
    const matches = part.match(/<[^>]+>/g) ?? []
    for (const m of matches) ids.push(normalizeMessageId(m))
    if (!matches.length && part.trim()) ids.push(normalizeMessageId(part.trim()))
  }
  return [...new Set(ids)]
}

export function parseInReplyToHeader(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  const match = raw.match(/<[^>]+>/)
  return normalizeMessageId(match ? match[0] : raw.trim())
}

export async function resolveEmailThreadId(
  db: SupabaseClient,
  userId: string,
  opts: {
    messageId: string
    subject: string
    inReplyTo?: string | null
    referencesIds?: string[]
  },
): Promise<{ threadId: string; inReplyTo: string | null; referencesIds: string[] }> {
  const inReplyTo = opts.inReplyTo ?? null
  const referencesIds = opts.referencesIds ?? []
  const lookupIds = [...new Set([
    ...(inReplyTo ? messageIdLookupVariants(inReplyTo) : []),
    ...referencesIds.flatMap(id => messageIdLookupVariants(id)),
  ])]

  if (lookupIds.length) {
    const { data: parents } = await db
      .from('emails')
      .select('message_id, thread_id')
      .eq('user_id', userId)
      .in('message_id', lookupIds)
      .limit(5)

    const parent = parents?.find(p => p.thread_id) ?? parents?.[0]
    if (parent?.thread_id) {
      return { threadId: parent.thread_id, inReplyTo, referencesIds }
    }
    if (parent?.message_id) {
      return { threadId: parent.message_id, inReplyTo, referencesIds }
    }
  }

  const cleaned = cleanEmailSubject(opts.subject)
  if (cleaned.length >= 8) {
    const { data: bySubject } = await db
      .from('emails')
      .select('thread_id, subject')
      .eq('user_id', userId)
      .not('thread_id', 'is', null)
      .ilike('subject', `%${cleaned.slice(0, 40)}%`)
      .limit(3)

    const match = (bySubject ?? []).find(row =>
      cleanEmailSubject(row.subject ?? '') === cleaned && row.thread_id,
    )
    if (match?.thread_id) {
      return { threadId: match.thread_id, inReplyTo, referencesIds }
    }
  }

  return { threadId: opts.messageId, inReplyTo, referencesIds }
}

export type ThreadStatusKind =
  | 'en_cours'
  | 'question'
  | 'relance'
  | 'sans_reponse'
  | 'accepte'
  | 'refuse'

export const THREAD_STATUS_META: Record<ThreadStatusKind, { label: string; color: string; emoji: string }> = {
  en_cours: { label: 'En cours', color: '#3B7FE8', emoji: '🔵' },
  question: { label: 'Question', color: '#f59e0b', emoji: '🟡' },
  relance: { label: 'Relance', color: '#f97316', emoji: '🟠' },
  sans_reponse: { label: 'Sans réponse', color: '#ef4444', emoji: '🔴' },
  accepte: { label: 'Accepté', color: '#10b981', emoji: '🟢' },
  refuse: { label: 'Refusé', color: '#6b7280', emoji: '⚫' },
}

export function computeThreadStatus(
  emails: Array<{
    received_at?: string | null
    mail_folder?: string | null
    ao_detection_category?: string | null
    from_address?: string | null
  }>,
  noResponseDays = 5,
): ThreadStatusKind {
  const sorted = [...emails].sort(
    (a, b) => new Date(a.received_at ?? 0).getTime() - new Date(b.received_at ?? 0).getTime(),
  )
  const last = sorted[sorted.length - 1]
  if (!last) return 'en_cours'

  const lastCat = last.ao_detection_category
  if (lastCat === 'acceptation') return 'accepte'
  if (lastCat === 'refus') return 'refuse'
  if (lastCat === 'question') return 'question'
  if (lastCat === 'relance') return 'relance'

  const lastDate = last.received_at ? new Date(last.received_at) : null
  const daysSince = lastDate
    ? (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    : 0
  const lastIsSent = last.mail_folder === 'sent'
  if (!lastIsSent && daysSince >= noResponseDays) return 'sans_reponse'

  if (lastCat === 'reponse' || lastIsSent) return 'en_cours'
  return 'en_cours'
}

export function groupEmailsByThread<T extends {
  id?: string
  thread_id?: string | null
  message_id?: string | null
  subject?: string | null
  received_at?: string | null
}>(
  emails: T[],
): Array<{ threadId: string; emails: T[]; title: string }> {
  const map = new Map<string, T[]>()
  for (const em of emails) {
    const tid = em.thread_id ?? em.message_id ?? em.id ?? 'unknown'
    const list = map.get(tid) ?? []
    list.push(em)
    map.set(tid, list)
  }
  return [...map.entries()].map(([threadId, list]) => {
    const sorted = [...list].sort(
      (a, b) => new Date((a as { received_at?: string }).received_at ?? 0).getTime()
        - new Date((b as { received_at?: string }).received_at ?? 0).getTime(),
    )
    const first = sorted[0]
    const title = cleanEmailSubject(first?.subject ?? '') || first?.subject || 'Fil sans titre'
    return { threadId, emails: sorted, title }
  }).sort((a, b) => {
    const aLast = a.emails[a.emails.length - 1] as { received_at?: string }
    const bLast = b.emails[b.emails.length - 1] as { received_at?: string }
    return new Date(bLast.received_at ?? 0).getTime() - new Date(aLast.received_at ?? 0).getTime()
  })
}
