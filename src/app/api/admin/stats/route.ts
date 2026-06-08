export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

const ADMIN_EMAIL = 'contact@nikodex.fr'

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserFromRequest(req)
    if (!userId) return unauthorized()

    const db = createAdminClient()

    const { data: { user } } = await db.auth.admin.getUserById(userId)
    if (!user || user.email !== ADMIN_EMAIL) {
      return Response.json({ success: false, error: 'Accès réservé' }, { status: 403 })
    }

    const { data: { users } } = await db.auth.admin.listUsers()
    if (!users) return Response.json({ success: true, data: [] })

    const stats = await Promise.all(users.map(async (u) => {
      const uid = u.id
      const [
        { count: aoActifs },
        { count: aoTotal },
        { count: aoGagnes },
        { count: emailsEnvoyes },
        { count: devisRecus },
        { count: emailsSync },
      ] = await Promise.all([
        db.from('tenders').select('*', { count: 'exact', head: true }).eq('user_id', uid).in('status', ['nouveau', 'en_cours', 'urgence']),
        db.from('tenders').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        db.from('tenders').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'gagne'),
        db.from('email_logs').select('*, tender:tenders!inner(user_id)', { count: 'exact', head: true }).eq('tender.user_id', uid).eq('success', true),
        db.from('quotes').select('*, tender:tenders!inner(user_id)', { count: 'exact', head: true }).eq('tender.user_id', uid),
        db.from('emails').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      ])

      const tauxReussite = aoTotal && aoTotal > 0
        ? Math.round(((aoGagnes ?? 0) / aoTotal) * 100)
        : 0

      return {
        id: uid,
        email: u.email ?? '',
        display_name: u.user_metadata?.full_name ?? u.email ?? '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        ao_actifs: aoActifs ?? 0,
        ao_total: aoTotal ?? 0,
        ao_gagnes: aoGagnes ?? 0,
        emails_envoyes: emailsEnvoyes ?? 0,
        devis_recus: devisRecus ?? 0,
        emails_sync: emailsSync ?? 0,
        taux_reussite: tauxReussite,
      }
    }))

    return Response.json({ success: true, data: stats })
  } catch (e: any) {
    console.error('[GET /api/admin/stats]', e?.message)
    return Response.json({ success: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
