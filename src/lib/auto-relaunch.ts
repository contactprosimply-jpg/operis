import { createAdminClient } from '@/lib/supabase'
import { tenderService } from '@/services/tender.service'

const ACTIVE_TENDER_STATUSES = ['nouveau', 'en_cours', 'urgence']
const RELAUNCH_AFTER_MS = 7 * 86400000

export interface AutoRelaunchResult {
  sent: number
  errors: number
  skipped: number
  tenders: number
}

/**
 * Relance automatique des fournisseurs sans réponse depuis 7 jours
 * (1ère relance après consultation, 2ème après 1ère relance — max 2).
 */
export async function runAutoRelaunches(): Promise<AutoRelaunchResult> {
  const db = createAdminClient()
  const cutoff = new Date(Date.now() - RELAUNCH_AFTER_MS).toISOString()

  const { data: rows, error } = await db
    .from('consultation_suppliers')
    .select('tender_id, supplier_id, last_sent_at, status, relaunch_count')
    .in('status', ['envoye', 'relance'])
    .not('last_sent_at', 'is', null)
    .lte('last_sent_at', cutoff)

  if (error) throw new Error(error.message)
  if (!rows?.length) {
    return { sent: 0, errors: 0, skipped: 0, tenders: 0 }
  }

  const tenderIds = [...new Set(rows.map(r => r.tender_id))]
  const { data: tenders } = await db
    .from('tenders')
    .select('id, user_id, status, title')
    .in('id', tenderIds)

  const tenderMap = new Map(
    (tenders ?? [])
      .filter(t => ACTIVE_TENDER_STATUSES.includes(t.status))
      .map(t => [t.id, t]),
  )

  let sent = 0
  let errors = 0
  let skipped = 0
  const touchedTenders = new Set<string>()
  const sentByTender = new Map<string, { userId: string; title: string; count: number }>()

  for (const row of rows) {
    const tender = tenderMap.get(row.tender_id)
    if (!tender?.user_id) {
      skipped++
      continue
    }

    touchedTenders.add(row.tender_id)

    const result = await tenderService.relaunchSupplier(
      row.tender_id,
      row.supplier_id,
      tender.user_id,
    )

    if (result.success) {
      sent++
      const prev = sentByTender.get(row.tender_id)
      if (prev) prev.count++
      else sentByTender.set(row.tender_id, { userId: tender.user_id, title: tender.title, count: 1 })
    } else {
      errors++
      console.error(
        `[AutoRelaunch] ${row.tender_id}/${row.supplier_id}: ${result.error}`,
      )
    }
  }

  const today = new Date().toISOString().split('T')[0]
  for (const [tenderId, info] of sentByTender) {
    try {
      const { data: existing } = await db
        .from('notifications')
        .select('id')
        .eq('user_id', info.userId)
        .eq('tender_id', tenderId)
        .eq('type', 'no_response')
        .gte('created_at', `${today}T00:00:00`)
        .maybeSingle()
      if (existing) continue

      await db.from('notifications').insert({
        user_id: info.userId,
        type: 'no_response',
        title: '📤 Relances automatiques',
        message: `AO "${info.title}" — ${info.count} relance(s) envoyée(s)`,
        tender_id: tenderId,
        is_read: false,
      })
    } catch {
      // notification optionnelle
    }
  }

  return {
    sent,
    errors,
    skipped,
    tenders: touchedTenders.size,
  }
}
