import { createAdminClient } from '@/lib/supabase'

export type NotifType =
  | 'deadline_urgent'
  | 'deadline_warning'
  | 'missing_quote'
  | 'no_response'

export async function checkAlertsForUser(userId: string): Promise<number> {
  const db = createAdminClient()
  let created = 0

  // Fetch existing recent notifications in one query to avoid duplicates
  const cutoff20h = new Date(Date.now() - 20 * 3600 * 1000).toISOString()
  const { data: recentNotifs } = await db
    .from('notifications')
    .select('type, tender_id')
    .eq('user_id', userId)
    .gte('created_at', cutoff20h)

  const notified = new Set<string>(
    (recentNotifs ?? []).map((n: any) => `${n.type}:${n.tender_id}`)
  )

  const notify = async (
    type: NotifType,
    title: string,
    message: string,
    tenderId: string
  ) => {
    if (notified.has(`${type}:${tenderId}`)) return
    const { error } = await db.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      tender_id: tenderId,
      is_read: false,
    })
    if (!error) {
      notified.add(`${type}:${tenderId}`)
      created++
    }
  }

  // ── 1. Active tenders ───────────────────────────────────────
  const { data: tenders } = await db
    .from('tenders')
    .select('id, title, client, deadline, status, created_at')
    .eq('user_id', userId)
    .in('status', ['nouveau', 'en_cours', 'urgence'])

  if (!tenders?.length) return 0

  const now = Date.now()
  const tenderIds: string[] = tenders.map((t: any) => t.id)

  for (const t of tenders as any[]) {
    // Deadline warnings
    if (t.deadline) {
      const days = Math.ceil((new Date(t.deadline).getTime() - now) / 86400000)
      if (days >= 0 && days <= 2) {
        await notify(
          'deadline_urgent',
          `⚡ Deadline dans ${days}j — ${t.title}`,
          `L'AO "${t.title}" (${t.client}) expire dans ${days} jour(s). Action requise.`,
          t.id
        )
      } else if (days > 2 && days <= 7) {
        await notify(
          'deadline_warning',
          `⏰ Deadline dans ${days}j — ${t.title}`,
          `L'AO "${t.title}" (${t.client}) expire dans ${days} jours.`,
          t.id
        )
      }
    }

    // AO actif > 30 jours sans devis reçu
    const ageDays = Math.floor((now - new Date(t.created_at).getTime()) / 86400000)
    if (ageDays > 30) {
      const { count } = await db
        .from('quotes')
        .select('*', { count: 'exact', head: true })
        .eq('tender_id', t.id)
      if ((count ?? 0) === 0) {
        await notify(
          'missing_quote',
          `📋 Aucun devis — ${t.title}`,
          `L'AO "${t.title}" est actif depuis ${ageDays} jours sans aucun devis reçu.`,
          t.id
        )
      }
    }
  }

  // ── 2. Fournisseurs sans réponse > 7 jours ──────────────────
  if (tenderIds.length > 0) {
    const cutoff7d = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: stale } = await db
      .from('consultation_suppliers')
      .select('tender_id, last_sent_at, supplier:suppliers(name)')
      .in('tender_id', tenderIds)
      .in('status', ['envoye', 'relance'])
      .lt('last_sent_at', cutoff7d)

    for (const cs of (stale ?? []) as any[]) {
      const name = cs.supplier?.name ?? 'Fournisseur'
      const tender = (tenders as any[]).find(t => t.id === cs.tender_id)
      await notify(
        'no_response',
        `🔔 Sans réponse — ${name}`,
        `${name} n'a pas répondu à "${tender?.title ?? 'AO'}" depuis plus de 7 jours.`,
        cs.tender_id
      )
    }
  }

  return created
}
