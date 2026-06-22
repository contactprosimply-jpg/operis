import type { Email } from '@/types/database'

export function normalizeSearchText(value: string): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function mailMatchesSearch(
  email: Pick<Email, 'subject' | 'from_address' | 'to_address'>,
  query: string,
): boolean {
  const q = normalizeSearchText(query.trim())
  if (!q) return true
  const haystack = normalizeSearchText(
    `${email.subject ?? ''} ${email.from_address ?? ''} ${email.to_address ?? ''}`,
  )
  return haystack.includes(q)
}

export function sortEmailsSearchResults<T extends Email>(emails: T[]): T[] {
  return [...emails].sort((a, b) => {
    const fav = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0)
    if (fav !== 0) return fav
    const dateB = b.received_at ? new Date(b.received_at).getTime() : 0
    const dateA = a.received_at ? new Date(a.received_at).getTime() : 0
    return dateB - dateA
  })
}
