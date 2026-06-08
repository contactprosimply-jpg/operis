export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { checkAlertsForUser } from '@/lib/alerts'
import { sendHtmlEmail } from '@/lib/mailer'

const ADMIN_EMAIL = 'contact@nikodex.fr'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Vérifier les alertes pour tous les utilisateurs
  const { data: { users } } = await db.auth.admin.listUsers()
  if (!users?.length) return Response.json({ success: true, data: { users: 0, notifications: 0 } })

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

async function sendDigest(db: ReturnType<typeof createAdminClient>) {
  if (!process.env.SMTP_USER) return

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: notifs } = await db
    .from('notifications')
    .select('*, tender:tenders(title, client)')
    .in('type', ['deadline_urgent', 'deadline_warning', 'missing_quote', 'no_response'])
    .gte('created_at', todayStart.toISOString())
    .order('type', { ascending: true })
    .limit(100)

  if (!notifs?.length) return

  const urgent = notifs.filter((n: any) => n.type === 'deadline_urgent')
  const warning = notifs.filter((n: any) => n.type === 'deadline_warning')
  const missing = notifs.filter((n: any) => n.type === 'missing_quote')
  const noResp = notifs.filter((n: any) => n.type === 'no_response')

  const row = (n: any) => `
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid #f3f4f6;font-size:13px;">${n.title}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${n.message}</td>
    </tr>`

  const section = (label: string, color: string, items: any[]) =>
    items.length === 0 ? '' : `
    <h3 style="color:${color};font-size:14px;margin:24px 0 8px;font-family:Arial,sans-serif;">${label} (${items.length})</h3>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left;padding:6px 14px;background:#f9fafb;border-bottom:2px solid #e5e7eb;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Alerte</th>
        <th style="text-align:left;padding:6px 14px;background:#f9fafb;border-bottom:2px solid #e5e7eb;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Détail</th>
      </tr></thead>
      <tbody>${items.map(row).join('')}</tbody>
    </table>`

  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const hasUrgent = urgent.length > 0

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1f2937;background:#f9fafb;padding:0;margin:0;">
<div style="max-width:660px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#0f1117;padding:20px 28px;display:flex;align-items:center;gap:12px;">
    <div style="width:36px;height:36px;background:#3b7ef6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;flex-shrink:0;">OP</div>
    <div>
      <div style="font-size:17px;font-weight:700;color:#f1f3f9;">Rapport quotidien Operis</div>
      <div style="font-size:12px;color:#8b92a5;">${dateStr}</div>
    </div>
  </div>
  <div style="padding:24px 28px;">
    <div style="background:${hasUrgent ? '#fef2f2' : '#eff6ff'};border:1px solid ${hasUrgent ? '#fecaca' : '#bfdbfe'};border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:${hasUrgent ? '#991b1b' : '#1e40af'};">
      <strong>${notifs.length} alerte(s)</strong> requièrent votre attention aujourd'hui.
      ${hasUrgent ? ` <strong>${urgent.length} urgente(s).</strong>` : ''}
    </div>
    ${section('🔴 Deadlines urgentes (≤ 2 jours)', '#ef4444', urgent)}
    ${section('🟡 Deadlines proches (≤ 7 jours)', '#d97706', warning)}
    ${section('📋 Devis manquants (> 30 jours)', '#6b7280', missing)}
    ${section('🔔 Sans réponse (> 7 jours)', '#8b5cf6', noResp)}
    <div style="margin-top:28px;text-align:center;">
      <a href="https://operis-f26g78.vercel.app/dashboard" style="display:inline-block;padding:10px 24px;background:#3b7ef6;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">
        Ouvrir Operis →
      </a>
    </div>
  </div>
  <div style="padding:14px 28px;border-top:1px solid #f3f4f6;text-align:center;font-size:10px;color:#9ca3af;">
    Operis · Gestion AO BTP · Ce rapport est généré automatiquement chaque matin à 8h
  </div>
</div>
</body></html>`

  await sendHtmlEmail({
    to: ADMIN_EMAIL,
    subject: `[Operis] ${notifs.length} alerte(s)${hasUrgent ? ` — ${urgent.length} URGENTE(S)` : ''} — ${new Date().toLocaleDateString('fr-FR')}`,
    html,
  })
}
