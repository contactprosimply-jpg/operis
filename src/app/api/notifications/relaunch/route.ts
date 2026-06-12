export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { tenderService } from '@/services/tender.service'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const body = await req.json()
  const notificationId = typeof body.id === 'string' ? body.id : ''
  const action = body.action === 'send' ? 'send' : body.action === 'cancel' ? 'cancel' : null

  if (!notificationId || !action) {
    return Response.json({ success: false, error: 'id et action requis' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: notif, error } = await db
    .from('notifications')
    .select('id, user_id, type, tender_id, supplier_id, is_read')
    .eq('id', notificationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !notif) {
    return Response.json({ success: false, error: 'Notification introuvable' }, { status: 404 })
  }

  if (notif.type !== 'relaunch_confirm') {
    return Response.json({ success: false, error: 'Type de notification invalide' }, { status: 400 })
  }

  await db.from('notifications').update({ is_read: true }).eq('id', notificationId)

  if (action === 'cancel') {
    return Response.json({ success: true, data: { cancelled: true } })
  }

  if (!notif.tender_id || !notif.supplier_id) {
    return Response.json({ success: false, error: 'Relance incomplète' }, { status: 400 })
  }

  const result = await tenderService.relaunchSupplier(
    notif.tender_id,
    notif.supplier_id,
    userId,
  )

  if (!result.success) {
    return Response.json({ success: false, error: result.error ?? 'Erreur relance' }, { status: 500 })
  }

  return Response.json({ success: true, data: { sent: true } })
}
