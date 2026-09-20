export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { checkAlertsForUser } from '@/lib/alerts'
import { sendHtmlEmail, isEmailConfigured } from '@/lib/mailer'
import { listAllAuthUsers } from '@/lib/auth-users'

const ADMIN_EMAIL = 'operiscontact@gmail.com'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Vérifier les alertes pour tous les utilisateurs
  const users = await listAllAuthUsers(db)
  if (!users.length) return Response.json({ success: true, data: { users: 0, notifications: 0 } })

  let totalNotifs = 0
  for (const user of users) {
    try {
      const n = await checkAlertsForUser(user.id)
      totalNotifs += n
    } catch (e: any) {
      console.error(`[Cron/Alerts] user ${user.id}:`, e?.message)
    }
  }

  // Email digest quotidien à l'admin
  try {
    await sendDigest(db)
  } catch (e: any) {
    console.error('[Cron/Alerts] digest email:', e?.message)
  }

  console.log(`[Cron/Alerts] ${users.length} users, ${totalNotifs} notifications créées`)
  return Response.json({ success: true, data: { users: users.length, notifications: totalNotifs } })
}

/**
 * Rapport quotidien à l'admin : des CHIFFRES seulement. Il contenait auparavant les titres d'AO
 * et les noms de clients de tous les comptes — des données que chaque utilisateur reçoit déjà dans
 * son propre récap (cron/digest), sans raison de les centraliser dans une boîte mail.
 */
async function sendDigest(db: ReturnType<typeof createAdminClient>) {
  if (!isEmailConfigured()) return

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: notifs } = await db
    .from('notifications')
    .select('type, user_id')
    .in('type', ['deadline_urgent', 'deadline_warning', 'missing_quote', 'no_response'])
    .gte('created_at', todayStart.toISOString())
    .limit(5000)

  if (!notifs?.length) return

  const count = (t: string) => notifs.filter(n => n.type === t).length
  const urgent = count('deadline_urgent')
  const usersConcerned = new Set(notifs.map(n => n.user_id)).size
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const line = (label: string, n: number) => n === 0 ? '' : `<tr><td style="padding:8px 14px;border-bottom:1px solid #f3f4f6;font-size:13px;">${label}</td><td style="padding:8px 14px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;font-weight:600;">${n}</td></tr>`

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1f2937;background:#f9fafb;margin:0;padding:0;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#0f1117;padding:18px 28px;">
    <div style="font-size:17px;font-weight:700;color:#f1f3f9;">Rapport quotidien Operis</div>
    <div style="font-size:12px;color:#8b92a5;">${dateStr}</div>
  </div>
  <div style="padding:24px 28px;">
    <p style="margin:0 0 16px;font-size:13px;">${notifs.length} alerte(s) créée(s) aujourd'hui pour ${usersConcerned} utilisateur(s).</p>
    <table style="width:100%;border-collapse:collapse;">
      ${line('Deadlines urgentes (≤ 2 jours)', urgent)}
      ${line('Deadlines proches (≤ 7 jours)', count('deadline_warning'))}
      ${line('Devis en attente', count('missing_quote'))}
      ${line('Sans réponse (> 7 jours)', count('no_response'))}
    </table>
    <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;">Compteurs uniquement — le détail (AO, clients) n'est visible que dans le compte de chaque utilisateur.</p>
  </div>
</div>
</body></html>`

  await sendHtmlEmail({
    to: ADMIN_EMAIL,
    subject: `[Operis] ${notifs.length} alerte(s)${urgent > 0 ? ` — ${urgent} URGENTE(S)` : ''} — ${new Date().toLocaleDateString('fr-FR')}`,
    html,
  })
}
