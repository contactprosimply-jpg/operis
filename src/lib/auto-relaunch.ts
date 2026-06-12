import { createAdminClient } from '@/lib/supabase'
import { tenderService } from '@/services/tender.service'
import {
  getUserSettings,
  isWorkingDay,
  relanceMaxReached,
  type UserSettings,
} from '@/lib/user-settings'

const ACTIVE_TENDER_STATUSES = ['nouveau', 'en_cours', 'urgence']

export interface AutoRelaunchResult {
  sent: number
  errors: number
  skipped: number
  tenders: number
  pending: number
}

type ConsultationRow = {
  tender_id: string
  supplier_id: string
  last_sent_at: string | null
  status: string
  relaunch_count: number | null
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000
}

function isRelanceDue(row: ConsultationRow, settings: UserSettings): boolean {
  if (!row.last_sent_at) return false
  const elapsed = daysSince(row.last_sent_at)
  const count = row.relaunch_count ?? 0

  if (row.status === 'envoye') {
    return elapsed >= settings.relance_first_delay_days
  }
  if (row.status === 'relance' || row.status === 'relance_2') {
    return elapsed >= settings.relance_interval_days
  }
  return false
}

async function queueRelaunchConfirm(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  tenderId: string,
  supplierId: string,
  supplierName: string,
  tenderTitle: string,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  const { data: existing } = await db
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('tender_id', tenderId)
    .eq('supplier_id', supplierId)
    .eq('type', 'relaunch_confirm')
    .eq('is_read', false)
    .gte('created_at', `${today}T00:00:00`)
    .maybeSingle()

  if (existing) return

  await db.from('notifications').insert({
    user_id: userId,
    type: 'relaunch_confirm',
    title: 'Relance en attente',
    message: `Une relance va être envoyée à ${supplierName}. Confirmer l'envoi ?`,
    tender_id: tenderId,
    supplier_id: supplierId,
    is_read: false,
  })
}

export async function runAutoRelaunchesForUser(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  settings?: UserSettings,
): Promise<AutoRelaunchResult> {
  const cfg = settings ?? await getUserSettings(db, userId)
  const result: AutoRelaunchResult = { sent: 0, errors: 0, skipped: 0, tenders: 0, pending: 0 }

  if (cfg.relance_working_days_only && !isWorkingDay()) {
    return result
  }

  const { data: rows, error } = await db
    .from('consultation_suppliers')
    .select('tender_id, supplier_id, last_sent_at, status, relaunch_count')
    .in('status', ['envoye', 'relance', 'relance_2'])
    .not('last_sent_at', 'is', null)

  if (error) throw new Error(error.message)
  if (!rows?.length) return result

  const tenderIds = [...new Set(rows.map(r => r.tender_id))]
  const { data: tenders } = await db
    .from('tenders')
    .select('id, user_id, status, title')
    .in('id', tenderIds)
    .eq('user_id', userId)

  const tenderMap = new Map(
    (tenders ?? [])
      .filter(t => ACTIVE_TENDER_STATUSES.includes(t.status))
      .map(t => [t.id, t]),
  )

  const supplierIds = [...new Set(rows.map(r => r.supplier_id))]
  const { data: suppliers } = await db
    .from('suppliers')
    .select('id, name, email')
    .in('id', supplierIds)
    .eq('user_id', userId)

  const supplierMap = new Map((suppliers ?? []).map(s => [s.id, s]))
  const touchedTenders = new Set<string>()
  const sentByTender = new Map<string, { userId: string; title: string; count: number }>()

  for (const row of rows as ConsultationRow[]) {
    const tender = tenderMap.get(row.tender_id)
    if (!tender?.user_id) {
      result.skipped++
      continue
    }

    if (relanceMaxReached(row.relaunch_count ?? 0, cfg.relance_max_count)) {
      result.skipped++
      continue
    }

    if (!isRelanceDue(row, cfg)) {
      result.skipped++
      continue
    }

    const supplier = supplierMap.get(row.supplier_id)
    if (!supplier) {
      result.skipped++
      continue
    }

    touchedTenders.add(row.tender_id)

    if (cfg.relance_confirm_before_send) {
      try {
        await queueRelaunchConfirm(
          db,
          userId,
          row.tender_id,
          row.supplier_id,
          supplier.name ?? supplier.email,
          tender.title,
        )
        result.pending++
      } catch (err) {
        console.error('[AutoRelaunch] queue confirm', err)
        result.errors++
      }
      continue
    }

    const relaunchResult = await tenderService.relaunchSupplier(
      row.tender_id,
      row.supplier_id,
      tender.user_id,
    )

    if (relaunchResult.success) {
      result.sent++
      const prev = sentByTender.get(row.tender_id)
      if (prev) prev.count++
      else sentByTender.set(row.tender_id, { userId: tender.user_id, title: tender.title, count: 1 })
    } else {
      result.errors++
      console.error(
        `[AutoRelaunch] ${row.tender_id}/${row.supplier_id}: ${relaunchResult.error}`,
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

  result.tenders = touchedTenders.size
  return result
}

/** Relances automatiques pour tous les utilisateurs (cron / sync). */
export async function runAutoRelaunches(): Promise<AutoRelaunchResult> {
  const db = createAdminClient()
  const { data: accounts } = await db
    .from('mail_accounts')
    .select('user_id')
    .eq('is_active', true)

  const userIds = [...new Set((accounts ?? []).map(a => a.user_id))]
  const total: AutoRelaunchResult = { sent: 0, errors: 0, skipped: 0, tenders: 0, pending: 0 }

  for (const userId of userIds) {
    try {
      const settings = await getUserSettings(db, userId)
      const r = await runAutoRelaunchesForUser(db, userId, settings)
      total.sent += r.sent
      total.errors += r.errors
      total.skipped += r.skipped
      total.tenders += r.tenders
      total.pending += r.pending
    } catch (err) {
      console.error('[AutoRelaunch] user', userId, err)
      total.errors++
    }
  }

  return total
}
