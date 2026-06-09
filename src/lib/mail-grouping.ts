import type { Email } from '@/types/database'

export type MailGroupLabel = 'Aujourd\'hui' | 'Hier' | 'Cette semaine' | 'Ce mois' | 'Plus ancien'

export function getMailGroupLabel(dateStr: string | null): MailGroupLabel {
  if (!dateStr) return 'Plus ancien'
  const d = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 7)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  if (d >= startOfToday) return 'Aujourd\'hui'
  if (d >= startOfYesterday) return 'Hier'
  if (d >= startOfWeek) return 'Cette semaine'
  if (d >= startOfMonth) return 'Ce mois'
  return 'Plus ancien'
}

const GROUP_ORDER: MailGroupLabel[] = [
  'Aujourd\'hui', 'Hier', 'Cette semaine', 'Ce mois', 'Plus ancien',
]

export function groupEmailsByDate(emails: Email[]) {
  const map = new Map<MailGroupLabel, Email[]>()
  for (const label of GROUP_ORDER) map.set(label, [])

  for (const email of emails) {
    const label = getMailGroupLabel(email.received_at)
    map.get(label)!.push(email)
  }

  return GROUP_ORDER
    .map(label => ({ label, emails: map.get(label) ?? [] }))
    .filter(g => g.emails.length > 0)
}
