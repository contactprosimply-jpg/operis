// Profondeur de l'import initial IMAP : 0 (ou absent) = tout l'historique.
export const DEFAULT_MAIL_SYNC_LOOKBACK_MONTHS = 12

export function lookbackSinceDate(months: number | null | undefined, now = new Date()): Date | null {
  if (!months || months <= 0) return null
  const since = new Date(now)
  since.setMonth(since.getMonth() - months)
  return since
}
