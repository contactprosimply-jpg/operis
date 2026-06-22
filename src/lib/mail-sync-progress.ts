export type MailSyncProgressPayload = {
  synced_count?: number
  mailbox_total?: number
  initial_sync_complete?: boolean
  phase?: 'inbox' | 'sent' | 'incremental'
  sent_synced_count?: number
  sent_mailbox_total?: number
}

export type MailSyncProgressUI = {
  percent: number | null
  label: string
  current: number
  total: number
}

export const SYNC_PROGRESS_PENDING: MailSyncProgressUI = {
  percent: null,
  label: 'Synchronisation…',
  current: 0,
  total: 0,
}

export function mailSyncProgressFromPayload(
  progress: MailSyncProgressPayload,
): MailSyncProgressUI {
  if (progress.phase === 'sent' && (progress.sent_mailbox_total ?? 0) > 0) {
    const current = progress.sent_synced_count ?? 0
    const total = progress.sent_mailbox_total ?? 0
    return {
      current,
      total,
      percent: Math.min(100, Math.round((current / total) * 100)),
      label: `Envoyés · ${current.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}`,
    }
  }

  if ((progress.mailbox_total ?? 0) > 0) {
    const current = progress.synced_count ?? 0
    const total = progress.mailbox_total ?? 0
    const phaseLabel =
      progress.phase === 'incremental' ? 'Mise à jour'
        : progress.phase === 'sent' ? 'Envoyés'
          : 'Réception'
    return {
      current,
      total,
      percent: Math.min(100, Math.round((current / total) * 100)),
      label: `${phaseLabel} · ${current.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')}`,
    }
  }

  return SYNC_PROGRESS_PENDING
}
