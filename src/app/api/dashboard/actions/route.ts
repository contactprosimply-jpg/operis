export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { tenderService } from '@/services/tender.service'
import { getUserSettings, relanceMaxReached } from '@/lib/user-settings'
import { ACTIVE_TENDER_STATUSES, isRelanceDue, type ConsultationRow } from '@/lib/auto-relaunch'
import { QUOTE_OR_FILTER, quoteLookbackSince } from '@/lib/quote-mail-heuristic'
import type { DashboardExtra, DueRelaunch } from '@/lib/dashboard-actions'

// GET /api/dashboard/actions — ce que le dashboard ne sait pas déduire de la liste des AO :
// relances dues, relances en attente de feu vert, devis à rattacher, mails d'AO non créés.
export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const settings = await getUserSettings(db, userId)

  // AO visibles (mêmes règles d'accès que la liste des AO : équipe, assignations…)
  const all = await tenderService.getAll(userId)
  const activeIds = (all.success ? all.data : [])
    .filter(t => (ACTIVE_TENDER_STATUSES as string[]).includes(t.status))
    .map(t => t.tender_id)

  // a) fournisseurs sans réponse après le délai de relance — la règle exacte de la relance auto
  const dueRelaunches: DueRelaunch[] = []
  if (activeIds.length) {
    const { data: rows } = await db
      .from('consultation_suppliers')
      .select('tender_id, supplier_id, last_sent_at, status, relaunch_count')
      .in('tender_id', activeIds)
      .in('status', ['envoye', 'relance', 'relance_2'])
      .not('last_sent_at', 'is', null)

    const byTender = new Map<string, string[]>()
    for (const row of (rows ?? []) as ConsultationRow[]) {
      if (relanceMaxReached(row.relaunch_count ?? 0, settings.relance_max_count)) continue
      if (!isRelanceDue(row, settings)) continue
      byTender.set(row.tender_id, [...(byTender.get(row.tender_id) ?? []), row.supplier_id])
    }
    for (const [tenderId, supplierIds] of byTender) dueRelaunches.push({ tenderId, supplierIds })
  }

  // Relances en attente du feu vert de l'utilisateur
  const { count: pending } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'relaunch_confirm')
    .eq('is_read', false)

  // c) et d) : seulement si la messagerie est utilisée
  let unlinkedQuotes = 0
  let unlinkedAoMails = 0
  if (settings.mail_module_enabled) {
    const inbox = () => db
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('mail_folder', 'inbox')
      .is('deleted_at', null)
      .is('tender_id', null)

    const [quotes, aoMails] = await Promise.all([
      inbox().eq('is_ao', false).or(QUOTE_OR_FILTER).gte('received_at', quoteLookbackSince()),
      inbox().eq('is_ao', true),
    ])
    unlinkedQuotes = quotes.count ?? 0
    unlinkedAoMails = aoMails.count ?? 0
  }

  const data: DashboardExtra = {
    dueRelaunches,
    pendingRelaunchConfirmations: pending ?? 0,
    unlinkedQuotes,
    unlinkedAoMails,
    mailEnabled: settings.mail_module_enabled,
  }
  return Response.json({ success: true, data })
}
