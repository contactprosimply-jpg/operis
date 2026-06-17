import type { SupabaseClient } from '@supabase/supabase-js'
import type { EmailLabel } from '@/types/database'
import { detectAo } from '@/services/aoDetector.service'
import type { ImapEnvelopeMeta } from '@/lib/imap-client'

export type NotificationPriority = 'normal' | 'important'

export type UserNotificationType =
  | 'new_mail'
  | 'ao_detected'
  | 'important_reply'
  | 'quote_received'
  | 'deadline_urgent'
  | 'deadline_warning'
  | 'missing_quote'
  | 'relaunch_confirm'
  | 'new_ao'
  | 'no_response'

export function isEmailMarkedImportant(row: {
  priority?: string | null
  labels?: EmailLabel[] | null
}): boolean {
  if (row.priority === 'urgent') return true
  const labels = row.labels ?? []
  return labels.some(l => /^(urgent|important)$/i.test(l.name?.trim() ?? ''))
}

function previewText(text: string, max = 120): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

export async function createUserNotification(
  db: SupabaseClient,
  input: {
    userId: string
    type: UserNotificationType | string
    priority?: NotificationPriority
    title: string
    message: string
    tenderId?: string | null
    supplierId?: string | null
    emailId?: string | null
    dedupeEmailType?: boolean
  },
): Promise<void> {
  const priority = input.priority ?? 'normal'

  if (input.dedupeEmailType && input.emailId) {
    const { data: existing } = await db
      .from('notifications')
      .select('id')
      .eq('user_id', input.userId)
      .eq('email_id', input.emailId)
      .eq('type', input.type)
      .maybeSingle()
    if (existing?.id) return
  }

  const row: Record<string, unknown> = {
    user_id: input.userId,
    type: input.type,
    priority,
    title: input.title,
    message: input.message,
    is_read: false,
    tender_id: input.tenderId ?? null,
    supplier_id: input.supplierId ?? null,
    email_id: input.emailId ?? null,
  }

  const { error } = await db.from('notifications').insert(row)
  if (error && /column .* does not exist/i.test(error.message)) {
    const fallback = { ...row }
    delete fallback.priority
    delete fallback.email_id
    await db.from('notifications').insert(fallback)
  }
}

export async function notifyInboundEmailStored(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  envelope: ImapEnvelopeMeta,
  mailFolder: string,
  options?: { isAo?: boolean; bodySnippet?: string },
): Promise<void> {
  if (mailFolder !== 'inbox' || envelope.isRead) return

  const ao = options?.isAo === true || detectAo(envelope.subject, options?.bodySnippet ?? '').isAo
  const from = envelope.from?.split('<')[0].trim() || envelope.from || 'Expéditeur inconnu'
  const subject = envelope.subject || '(sans objet)'

  if (ao) {
    await createUserNotification(db, {
      userId,
      type: 'ao_detected',
      priority: 'important',
      title: '⭐ AO détecté',
      message: `${from} — ${previewText(subject)}`,
      emailId,
      dedupeEmailType: true,
    })
    return
  }

  await createUserNotification(db, {
    userId,
    type: 'new_mail',
    priority: 'normal',
    title: 'Nouveau mail',
    message: `${from} — ${previewText(subject)}`,
    emailId,
    dedupeEmailType: true,
  })
}

export async function notifyImportantThreadReply(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  envelope: ImapEnvelopeMeta,
  inReplyTo: string | null,
  referencesIds: string[],
): Promise<void> {
  const refs = new Set<string>()
  if (inReplyTo) refs.add(inReplyTo.trim())
  for (const r of referencesIds) {
    if (r?.trim()) refs.add(r.trim())
  }
  if (!refs.size) return

  const { data: parents } = await db
    .from('emails')
    .select('id, priority, labels, message_id')
    .eq('user_id', userId)
    .in('message_id', Array.from(refs))

  const importantParent = (parents ?? []).find(isEmailMarkedImportant)
  if (!importantParent) return

  const from = envelope.from?.split('<')[0].trim() || envelope.from || 'Expéditeur'
  const subject = envelope.subject || '(sans objet)'

  await createUserNotification(db, {
    userId,
    type: 'important_reply',
    priority: 'important',
    title: '⭐ Réponse sur fil important',
    message: `${from} — ${previewText(subject)}`,
    emailId,
    dedupeEmailType: true,
  })
}

export async function notifyAoDetectedAfterEnrich(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  subject: string,
  fromAddress: string,
): Promise<void> {
  const from = fromAddress?.split('<')[0].trim() || fromAddress || 'Expéditeur'
  await createUserNotification(db, {
    userId,
    type: 'ao_detected',
    priority: 'important',
    title: '⭐ AO détecté',
    message: `${from} — ${previewText(subject)}`,
    emailId,
    dedupeEmailType: true,
  })
}
