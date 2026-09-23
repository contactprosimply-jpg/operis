import type { SupabaseClient } from '@supabase/supabase-js'
import { headerHasExactAddress, supplierAddresses } from '@/lib/supplier-address'

export interface SupplierExchange {
  id: string
  direction: 'sent' | 'received'
  subject: string
  date: string
  source: 'email' | 'consultation'
}

const REAL_MAIL_LOG_TYPES = ['consultation', 'relance', 'relance_2']
const DEDUPE_WINDOW_MS = 10 * 60_000
const LIMIT = 8

const normSubject = (s: string) => s.replace(/^\s*(re|fwd?|tr)\s*:\s*/i, '').trim().toLowerCase()

// Une consultation/relance est journalisée dans email_logs ; la synchro du dossier Envoyés
// en importe ensuite la copie dans emails : on n'affiche qu'une des deux.
export function mergeExchanges(fromEmails: SupplierExchange[], fromLogs: SupplierExchange[]): SupplierExchange[] {
  const sentEmails = fromEmails.filter(e => e.direction === 'sent')
  const uniqueLogs = fromLogs.filter(log => !sentEmails.some(e =>
    normSubject(e.subject) === normSubject(log.subject)
    && Math.abs(new Date(e.date).getTime() - new Date(log.date).getTime()) <= DEDUPE_WINDOW_MS,
  ))
  return [...fromEmails, ...uniqueLogs]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, LIMIT)
}

type EmailRow = {
  id: string
  subject: string | null
  from_address: string | null
  to_address: string | null
  cc_address: string | null
  received_at: string | null
}

export async function getSupplierExchanges(
  db: SupabaseClient,
  userId: string,
  supplier: { id: string; email: string; additional_emails?: string[] | null },
): Promise<SupplierExchange[]> {
  const addresses = supplierAddresses(supplier)

  // Préfiltre SQL volontairement large ; la décision finale est un rapprochement exact en JS.
  const safe = addresses.filter(a => /^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(a))
  let emails: SupplierExchange[] = []
  if (safe.length > 0) {
    const orFilter = safe
      .flatMap(a => [`from_address.ilike.%${a}%`, `to_address.ilike.%${a}%`, `cc_address.ilike.%${a}%`])
      .join(',')
    const { data, error } = await db
      .from('emails')
      .select('id, subject, from_address, to_address, cc_address, received_at')
      .eq('user_id', userId)
      .in('mail_folder', ['inbox', 'sent'])
      .is('deleted_at', null)
      .or(orFilter)
      .order('received_at', { ascending: false })
      .limit(60)
    if (error) throw new Error(error.message)

    for (const r of (data ?? []) as EmailRow[]) {
      if (!r.received_at) continue
      const fromSupplier = addresses.some(a => headerHasExactAddress(r.from_address, a))
      const toSupplier = addresses.some(a => headerHasExactAddress(r.to_address, a) || headerHasExactAddress(r.cc_address, a))
      if (!fromSupplier && !toSupplier) continue
      emails.push({
        id: r.id,
        direction: fromSupplier ? 'received' : 'sent',
        subject: r.subject || '(sans objet)',
        date: r.received_at,
        source: 'email',
      })
    }
  }

  const { data: logs, error: logError } = await db
    .from('email_logs')
    .select('id, subject, sent_at')
    .eq('user_id', userId)
    .eq('supplier_id', supplier.id)
    .eq('success', true)
    .in('type', REAL_MAIL_LOG_TYPES)
    .order('sent_at', { ascending: false })
    .limit(20)
  if (logError) throw new Error(logError.message)

  const fromLogs: SupplierExchange[] = ((logs ?? []) as { id: string; subject: string | null; sent_at: string }[]).map(l => ({
    id: `log-${l.id}`,
    direction: 'sent',
    subject: l.subject || '(sans objet)',
    date: l.sent_at,
    source: 'consultation',
  }))

  emails = emails.filter(e => e.date)
  return mergeExchanges(emails, fromLogs)
}
