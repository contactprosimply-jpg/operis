// ============================================================
// OPERIS — lib/alerts.ts
// Vérification des alertes et création des notifications
// ============================================================

import { createAdminClient } from '@/lib/supabase'
import { sendHtmlEmail } from '@/lib/mailer'
import { getTenderAccessScope } from '@/lib/tender-access'
import { sitePath } from '@/lib/site-url'

const ADMIN_EMAIL = 'contact@nikodex.fr'

export async function checkAlertsForUser(userId: string): Promise<number> {
  const db = createAdminClient()
  let created = 0

  try {
    const scope = await getTenderAccessScope(userId)
    let tenderQuery = db
      .from('tenders')
      .select('*, consultation_suppliers(id, status, supplier_id, last_sent_at)')
      .in('status', ['nouveau', 'en_cours', 'urgence'])

    if (scope.isOrgOwner && scope.organizationId) {
      tenderQuery = tenderQuery.in('user_id', scope.teamUserIds)
    } else if (scope.organizationId) {
      tenderQuery = tenderQuery.or(`user_id.eq.${userId},assigned_to.eq.${userId}`)
    } else {
      tenderQuery = tenderQuery.eq('user_id', userId)
    }

    const { data: tenders } = await tenderQuery

    if (!tenders?.length) return 0

    const now = new Date()

    for (const tender of tenders) {
      // 1. Alerte deadline dans 7 jours
      if (tender.deadline) {
        const deadline = new Date(tender.deadline)
        const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000)

        if (daysLeft <= 7 && daysLeft >= 0) {
          // Vérifier si la notif existe déjà aujourd'hui
          const today = now.toISOString().split('T')[0]
          const { data: existing } = await db
            .from('notifications')
            .select('id')
            .eq('user_id', userId)
            .eq('tender_id', tender.id)
            .eq('type', daysLeft <= 2 ? 'deadline_urgent' : 'deadline_warning')
            .gte('created_at', `${today}T00:00:00`)
            .single()

          if (!existing) {
            const isUrgent = daysLeft <= 2
            await db.from('notifications').insert({
              user_id: userId,
              type: isUrgent ? 'deadline_urgent' : 'deadline_warning',
              priority: isUrgent ? 'important' : 'normal',
              title: isUrgent
                ? `⚡ URGENT — Deadline dans ${daysLeft}j`
                : `⚠️ Deadline dans ${daysLeft} jours`,
              message: `AO "${tender.title}" — échéance le ${new Date(tender.deadline).toLocaleDateString('fr-FR')}`,
              tender_id: tender.id,
              is_read: false,
            })
            created++

            // Envoyer email (J-7 warning ou J-2 urgent)
            try {
              const { data: { user } } = await db.auth.admin.getUserById(userId)
              if (user?.email) {
                const headerBg = isUrgent ? '#ef4444' : '#f59e0b'
                const headerLabel = isUrgent ? '⚡ DEADLINE URGENTE' : '⚠️ DEADLINE APPROCHANTE'
                const prefix = isUrgent ? '[URGENT]' : '[RAPPEL]'
                await sendHtmlEmail({
                  to: user.email,
                  subject: `${prefix} Operis — AO "${tender.title}" deadline dans ${daysLeft}j`,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <div style="background: ${headerBg}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
                        <h2 style="margin: 0; font-size: 18px;">${headerLabel}</h2>
                      </div>
                      <div style="background: #1e2130; color: #f1f3f9; padding: 24px; border-radius: 0 0 8px 8px;">
                        <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600;">${tender.title}</p>
                        <p style="margin: 0 0 8px; color: #8b92a5;">Client : ${tender.client}</p>
                        <p style="margin: 0 0 16px; color: ${isUrgent ? '#f87171' : '#fbbf24'}; font-weight: 600;">Deadline : ${new Date(tender.deadline).toLocaleDateString('fr-FR')} (dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''})</p>
                        <a href="${sitePath(`/tenders/${tender.id}`)}" style="display: inline-block; background: #3b7ef6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Voir l'AO →</a>
                      </div>
                    </div>
                  `,
                })
              }
            } catch (e) {
              console.error('[Alerts] Erreur envoi email deadline:', e)
            }
          }
        }
      }

      // 2. Alerte fournisseurs sans réponse depuis 7 jours
      const consultations = tender.consultation_suppliers ?? []
      const sevenDaysAgo = Date.now() - 7 * 86400000
      const nonResponders = consultations.filter((c: { status: string; last_sent_at?: string | null }) => {
        if (!['envoye', 'relance', 'relance_2'].includes(c.status)) return false
        const sentAt = c.last_sent_at ? new Date(c.last_sent_at).getTime() : 0
        return sentAt > 0 && sentAt <= sevenDaysAgo
      })

      if (nonResponders.length > 0) {
        const today = now.toISOString().split('T')[0]
        const { data: existing } = await db
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('tender_id', tender.id)
          .eq('type', 'missing_quote')
          .gte('created_at', `${today}T00:00:00`)
          .single()

        if (!existing) {
          await db.from('notifications').insert({
            user_id: userId,
            type: 'missing_quote',
            priority: 'important',
            title: `📭 ${nonResponders.length} devis en attente`,
            message: `AO "${tender.title}" — ${nonResponders.length} fournisseur(s) n'ont pas encore répondu`,
            tender_id: tender.id,
            is_read: false,
          })
          created++
        }
      }
    }
  } catch (e: any) {
    console.error('[checkAlertsForUser]', e?.message)
  }

  return created
}
