import type { SupabaseClient } from '@supabase/supabase-js'
import { extractEmailAddress } from '@/lib/mail-attachments'

export interface OperisContact {
  id: string
  email: string
  name: string | null
  company: string | null
  is_favorite: boolean
  ao_ids: string[]
  email_count: number
  last_contacted_at: string | null
}

export function formatContactAddress(contact: Pick<OperisContact, 'email' | 'name'>): string {
  const email = contact.email.toLowerCase().trim()
  const name = contact.name?.trim()
  if (name && name.toLowerCase() !== email) return `${name} <${email}>`
  return email
}

export function parseFromAddress(raw: string): { email: string; name: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { email: '', name: null }
  const email = extractEmailAddress(trimmed) || (trimmed.includes('@') ? trimmed.toLowerCase() : '')
  let name: string | null = null
  const angle = trimmed.match(/^(.+?)<[^>]+>/)
  if (angle?.[1]) {
    name = angle[1].trim().replace(/^["']|["']$/g, '')
    if (!name) name = null
  }
  return { email, name }
}

/** Parse une liste d'adresses séparées par des virgules (hors guillemets). */
export function parseEmailAddressList(raw: string | null | undefined): Array<{ email: string; name: string | null }> {
  if (!raw?.trim()) return []
  const parts: string[] = []
  let current = ''
  let inQuote = false
  for (const char of raw) {
    if (char === '"') inQuote = !inQuote
    if (char === ',' && !inQuote) {
      if (current.trim()) parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
    .map(p => parseFromAddress(p))
    .filter(p => p.email.includes('@'))
}

export function contactAvatarColor(email: string): string {
  const colors = ['#021246', '#3b7ef6', '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#f97316']
  let hash = 0
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) % colors.length
  return colors[Math.abs(hash)]
}

export function contactInitials(name: string | null | undefined, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export function contactTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (days > 0) return `il y a ${days} jour${days > 1 ? 's' : ''}`
  if (hours > 0) return `il y a ${hours}h`
  if (mins <= 1) return "à l'instant"
  return `il y a ${mins}min`
}

function mergeAoIds(existing: string[] | null | undefined, tenderId: string | null | undefined): string[] {
  const ids = [...(existing ?? [])]
  if (tenderId && !ids.includes(tenderId)) ids.push(tenderId)
  return ids
}

async function upsertOneContact(
  db: SupabaseClient,
  userId: string,
  email: string,
  name: string | null,
  contactedAt: string,
  tenderId: string | null | undefined,
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim()
  if (!normalizedEmail.includes('@')) return

  const { data: existing } = await db
    .from('contacts')
    .select('id, name, email_count, ao_ids, company')
    .eq('user_id', userId)
    .eq('email', normalizedEmail)
    .maybeSingle()

  const row = {
    user_id: userId,
    email: normalizedEmail,
    name: name?.trim() || existing?.name || null,
    last_contacted_at: contactedAt,
    email_count: (existing?.email_count ?? 0) + 1,
    ao_ids: mergeAoIds(existing?.ao_ids as string[] | undefined, tenderId),
  }

  const { error } = await db.from('contacts').upsert(row, { onConflict: 'user_id,email' })
  if (error) console.error('[contacts] upsert', normalizedEmail, error.message)
}

/** Upsert depuis un mail synchronisé (inbox = expéditeur, sent = destinataires). */
export async function upsertContactsFromSyncedEmail(
  db: SupabaseClient,
  userId: string,
  emailId: string,
): Promise<void> {
  const { data: em } = await db
    .from('emails')
    .select('from_address, to_address, mail_folder, received_at, tender_id')
    .eq('id', emailId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!em) return

  const contactedAt = em.received_at ?? new Date().toISOString()
  const tenderId = em.tender_id as string | null

  if (em.mail_folder === 'sent') {
    const recipients = parseEmailAddressList(em.to_address)
    for (const r of recipients) {
      await upsertOneContact(db, userId, r.email, r.name, contactedAt, tenderId)
    }
    return
  }

  const from = parseFromAddress(em.from_address ?? '')
  if (from.email) {
    await upsertOneContact(db, userId, from.email, from.name, contactedAt, tenderId)
  }
}

/** Upsert destinataires après envoi SMTP (TO, CC, BCC). */
export async function upsertContactsFromOutboundSend(
  db: SupabaseClient,
  userId: string,
  to: string,
  cc: string | undefined,
  bcc: string | undefined,
  tenderId: string | null | undefined,
  sentAt: string,
): Promise<void> {
  const all = [
    ...parseEmailAddressList(to),
    ...parseEmailAddressList(cc),
    ...parseEmailAddressList(bcc),
  ]
  const seen = new Set<string>()
  for (const r of all) {
    if (seen.has(r.email)) continue
    seen.add(r.email)
    await upsertOneContact(db, userId, r.email, r.name, sentAt, tenderId)
  }
}

export function sortContactsForAutocomplete(
  contacts: OperisContact[],
  query: string,
  tenderId?: string | null,
  limit = 12,
): OperisContact[] {
  const q = query.trim().toLowerCase()
  let pool = contacts
  if (q) {
    pool = contacts.filter(c =>
      c.email.toLowerCase().includes(q)
      || (c.name?.toLowerCase().includes(q))
      || (c.company?.toLowerCase().includes(q)),
    )
  }

  const tenderSet = new Set<string>()
  const tenderLinked: OperisContact[] = []
  const favorites: OperisContact[] = []
  const recent: OperisContact[] = []

  for (const c of pool) {
    if (tenderId && c.ao_ids?.includes(tenderId)) {
      if (!tenderSet.has(c.email)) {
        tenderSet.add(c.email)
        tenderLinked.push(c)
      }
      continue
    }
    if (c.is_favorite) {
      if (!tenderSet.has(c.email)) {
        tenderSet.add(c.email)
        favorites.push(c)
      }
      continue
    }
    if (!tenderSet.has(c.email)) {
      tenderSet.add(c.email)
      recent.push(c)
    }
  }

  recent.sort((a, b) => (b.last_contacted_at ?? '').localeCompare(a.last_contacted_at ?? ''))

  return [...tenderLinked, ...favorites, ...recent].slice(0, limit)
}

export function pickPrimaryTenderContact(contacts: OperisContact[], tenderId: string): OperisContact | null {
  const linked = contacts.filter(c => c.ao_ids?.includes(tenderId))
  if (!linked.length) return null
  linked.sort((a, b) => {
    const countDiff = b.email_count - a.email_count
    if (countDiff !== 0) return countDiff
    return (b.last_contacted_at ?? '').localeCompare(a.last_contacted_at ?? '')
  })
  return linked[0]
}
