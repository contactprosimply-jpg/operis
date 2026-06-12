import type { SupabaseClient } from '@supabase/supabase-js'
import type { EmailLabel } from '@/types/database'
import { PRESET_EMAIL_LABELS } from '@/lib/mail-api'

export type SmartLabelAction = 'replied' | 'forwarded' | 'moved' | 'read'
export type LabelSource = 'manual' | 'auto'

const REMOVE_ON_REPLY_IDS = new Set(['urgent-label', 'a-traiter', 'en-attente', 'urgent'])
const REMOVE_ON_REPLY_NAMES = new Set(['Urgent', 'À traiter', 'En attente'])

export const AUTO_LABEL_TOOLTIPS: Record<string, string> = {
  repondu: 'Ajouté automatiquement car vous avez répondu à ce mail',
  transfere: 'Ajouté automatiquement car vous avez transféré ce mail',
  'en-retard': 'Ajouté automatiquement : aucune réponse depuis 3 jours',
  'a-traiter': 'Ajouté automatiquement : mail lu sans action depuis 24h',
  archive: 'Ajouté automatiquement : mail archivé ou déplacé hors de l\'inbox',
}

export const SMART_LABEL_IDS = {
  urgent: 'urgent-label',
  aTraiter: 'a-traiter',
  repondu: 'repondu',
  enAttente: 'en-attente',
  transfere: 'transfere',
  enRetard: 'en-retard',
  archive: 'archive',
} as const

function getLabelDefinition(id: string): EmailLabel {
  const found = PRESET_EMAIL_LABELS.find(l => l.id === id)
  if (found) return { ...found }
  return { id, name: id, color: '#6b7280' }
}

function upsertAutoLabel(labels: EmailLabel[], id: string): EmailLabel[] {
  const def = getLabelDefinition(id)
  const filtered = labels.filter(l => l.id !== id)
  return [
    ...filtered,
    {
      ...def,
      source: 'auto' as LabelSource,
      autoReason: AUTO_LABEL_TOOLTIPS[id] ?? 'Ajouté automatiquement',
    },
  ]
}

export function applySmartLabelsToLabels(
  existing: EmailLabel[] | undefined,
  action: SmartLabelAction,
): EmailLabel[] {
  let labels = [...(existing ?? [])]

  switch (action) {
    case 'replied':
      labels = labels.filter(
        l => !REMOVE_ON_REPLY_IDS.has(l.id) && !REMOVE_ON_REPLY_NAMES.has(l.name),
      )
      return upsertAutoLabel(labels, SMART_LABEL_IDS.repondu)
    case 'forwarded':
      return upsertAutoLabel(labels, SMART_LABEL_IDS.transfere)
    case 'moved':
      return [
        {
          ...getLabelDefinition(SMART_LABEL_IDS.archive),
          source: 'auto',
          autoReason: AUTO_LABEL_TOOLTIPS.archive,
        },
      ]
    case 'read':
      return labels
    default:
      return labels
  }
}

export async function applySmartLabels(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  action: SmartLabelAction,
): Promise<EmailLabel[] | null> {
  const { data: mail, error } = await db
    .from('emails')
    .select('id, labels')
    .eq('id', emailId)
    .eq('user_id', userId)
    .single()

  if (error || !mail) return null

  const newLabels = applySmartLabelsToLabels(mail.labels as EmailLabel[] | undefined, action)
  await db.from('emails').update({ labels: newLabels }).eq('id', emailId).eq('user_id', userId)
  return newLabels
}

export async function runSmartLabelPeriodicChecks(
  db: SupabaseClient,
  userId: string,
): Promise<number> {
  let updated = 0
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: inboxMails } = await db
    .from('emails')
    .select('id, labels, received_at')
    .eq('user_id', userId)
    .eq('mail_folder', 'inbox')
    .lt('received_at', threeDaysAgo)

  for (const mail of inboxMails ?? []) {
    const labels = (mail.labels as EmailLabel[] | undefined) ?? []
    const hasTrigger = labels.some(
      l =>
        l.id === SMART_LABEL_IDS.urgent ||
        l.id === SMART_LABEL_IDS.aTraiter ||
        l.name === 'Urgent' ||
        l.name === 'À traiter',
    )
    const hasRepondu = labels.some(l => l.id === SMART_LABEL_IDS.repondu || l.name === 'Répondu')
    if (!hasTrigger || hasRepondu) continue
    if (labels.some(l => l.id === SMART_LABEL_IDS.enRetard)) continue

    const newLabels = upsertAutoLabel(labels, SMART_LABEL_IDS.enRetard)
    await db.from('emails').update({ labels: newLabels }).eq('id', mail.id)
    updated++
  }

  const { data: readMails } = await db
    .from('emails')
    .select('id, labels')
    .eq('user_id', userId)
    .eq('mail_folder', 'inbox')
    .eq('is_read', true)
    .lt('received_at', oneDayAgo)

  for (const mail of readMails ?? []) {
    const labels = (mail.labels as EmailLabel[] | undefined) ?? []
    if (labels.length > 0) continue

    const newLabels = upsertAutoLabel([], SMART_LABEL_IDS.aTraiter)
    await db.from('emails').update({ labels: newLabels }).eq('id', mail.id)
    updated++
  }

  return updated
}

export function labelBadgeStyle(label: EmailLabel): {
  background: string
  color: string
  border: string
} {
  const isAuto = label.source === 'auto'
  return {
    background: isAuto ? 'transparent' : `${label.color}18`,
    color: label.color,
    border: `1px solid ${label.color}${isAuto ? '' : '40'}`,
  }
}

export function labelTooltip(label: EmailLabel): string | undefined {
  if (label.source !== 'auto') return undefined
  return label.autoReason ?? AUTO_LABEL_TOOLTIPS[label.id] ?? 'Étiquette automatique'
}

export function manualLabel(label: EmailLabel): EmailLabel {
  return { ...label, source: 'manual', autoReason: undefined }
}
