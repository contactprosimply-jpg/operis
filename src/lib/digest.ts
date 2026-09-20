import type { SupabaseClient } from '@supabase/supabase-js'
import { sendHtmlEmail, isEmailConfigured } from '@/lib/mailer'
import { sitePath } from '@/lib/site-url'
import { getTenderAccessScope } from '@/lib/tender-access'
import { collectPriorityItems } from '@/lib/priorities'
import { requireBillingAccess } from '@/lib/billing/subscription'
import { listAllAuthUsers } from '@/lib/auth-users'
import { getNotificationSettings, markDigestSent } from '@/lib/notification-settings'
import {
  PRIORITY_KIND_LABEL,
  PRIORITY_KIND_ORDER,
  isAlertRecipient,
  parisClock,
  shouldSendDigest,
  type PriorityItem,
  type PriorityPayload,
} from '@/lib/priorities-rules'

export interface DigestDeadline {
  id: string
  title: string
  client: string
  daysLeft: number
}

/** Le contenu vient de mails externes : tout est échappé avant d'aller dans le HTML. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function ageLabel(days: number): string {
  if (days <= 0) return "aujourd'hui"
  return days === 1 ? 'depuis 1 jour' : `depuis ${days} jours`
}

const eur = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € HT`

function itemRow(it: PriorityItem): string {
  const who = it.supplierName ?? it.fromName
  const detail = [
    it.tenderTitle ? `AO « ${esc(it.tenderTitle)} »` : '',
    it.price ? `<strong>${esc(eur(it.price))}</strong>${it.isBestPrice ? ' · meilleur prix' : ''}` : '',
    ageLabel(it.ageDays),
  ].filter(Boolean).join(' · ')
  return `<tr><td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;">
    <a href="${sitePath(`/mail?email=${it.emailId}`)}" style="color:#1f2937;text-decoration:none;font-size:13px;font-weight:600;">${esc(who)}</a>
    <div style="font-size:12px;color:#374151;margin-top:2px;">${esc(it.subject)}</div>
    ${it.snippet ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${esc(it.snippet)}</div>` : ''}
    <div style="font-size:11px;color:#9ca3af;margin-top:4px;">${detail}</div>
  </td></tr>`
}

export function buildDigestEmail(payload: PriorityPayload, deadlines: DigestDeadline[], now = new Date()): { subject: string; html: string } {
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })

  const sections = PRIORITY_KIND_ORDER.map(kind => {
    const items = payload.items.filter(i => i.kind === kind)
    if (!items.length) return ''
    return `<h3 style="font-size:14px;margin:24px 0 6px;color:#111827;">${PRIORITY_KIND_LABEL[kind]} (${items.length})</h3>
      <table style="width:100%;border-collapse:collapse;">${items.map(itemRow).join('')}</table>`
  }).join('')

  const deadlineSection = deadlines.length === 0 ? '' : `<h3 style="font-size:14px;margin:24px 0 6px;color:#111827;">Échéances proches (${deadlines.length})</h3>
    <table style="width:100%;border-collapse:collapse;">${deadlines.map(d => `<tr><td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;">
      <a href="${sitePath(`/tenders/${d.id}`)}" style="color:#1f2937;text-decoration:none;font-size:13px;font-weight:600;">${esc(d.title)}</a>
      <div style="font-size:11px;color:${d.daysLeft <= 2 ? '#dc2626' : '#9ca3af'};margin-top:4px;">${esc(d.client)} · ${d.daysLeft === 0 ? "échéance aujourd'hui" : `échéance dans ${d.daysLeft} jour${d.daysLeft > 1 ? 's' : ''}`}</div>
    </td></tr>`).join('')}</table>`

  const parts: string[] = []
  if (payload.total > 0) parts.push(`${payload.total} élément${payload.total > 1 ? 's' : ''} à traiter`)
  if (deadlines.length > 0) parts.push(`${deadlines.length} échéance${deadlines.length > 1 ? 's' : ''} proche${deadlines.length > 1 ? 's' : ''}`)
  const summary = parts.join(' · ')

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1f2937;background:#f9fafb;margin:0;padding:0;">
<div style="max-width:620px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#021246;padding:18px 24px;">
    <div style="font-size:17px;font-weight:700;color:#fff;">Votre récap du matin</div>
    <div style="font-size:12px;color:#93aedd;text-transform:capitalize;">${esc(dateStr)}</div>
  </div>
  <div style="padding:20px 24px;">
    <p style="margin:0;font-size:14px;"><strong>${esc(summary)}</strong></p>
    ${sections}${deadlineSection}
    <div style="margin-top:28px;text-align:center;">
      <a href="${sitePath('/dashboard')}" style="display:inline-block;padding:11px 26px;background:#3b7ef6;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Ouvrir Operis →</a>
    </div>
  </div>
  <div style="padding:14px 24px;border-top:1px solid #f3f4f6;text-align:center;font-size:11px;color:#9ca3af;">
    Vous recevez ce récap les jours ouvrés. <a href="${sitePath('/settings?tab=notifications')}" style="color:#6b7280;">Changer l'heure ou le désactiver</a>
  </div>
</div>
</body></html>`

  return { subject: `[Operis] ${summary}`, html }
}

/** Échéances des 7 prochains jours pour les AO dont l'utilisateur est destinataire des alertes. */
export async function getUpcomingDeadlines(db: SupabaseClient, userId: string): Promise<DigestDeadline[]> {
  const scope = await getTenderAccessScope(userId)
  let q = db.from('tenders')
    .select('id, title, client, deadline, user_id, assigned_to')
    .in('status', ['nouveau', 'en_cours', 'urgence'])
    .not('deadline', 'is', null)
  if (scope.isOrgOwner && scope.organizationId) q = q.in('user_id', scope.teamUserIds)
  else if (scope.organizationId) q = q.or(`user_id.eq.${userId},assigned_to.eq.${userId}`)
  else q = q.eq('user_id', userId)

  const { data } = await q
  const now = Date.now()
  const out: DigestDeadline[] = []
  for (const t of data ?? []) {
    const daysLeft = Math.ceil((new Date(t.deadline as string).getTime() - now) / 86400000)
    if (daysLeft < 0 || daysLeft > 7) continue
    if (!isAlertRecipient(t as { user_id: string; assigned_to?: string | null }, userId, { isOrgOwner: !!scope.isOrgOwner, urgent: daysLeft <= 2 })) continue
    out.push({ id: t.id as string, title: t.title as string, client: t.client as string, daysLeft })
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft)
}

export async function sendUserDigests(db: SupabaseClient, now = new Date()): Promise<{ users: number; sent: number; failed: number }> {
  const clock = parisClock(now)
  const stats = { users: 0, sent: 0, failed: 0 }
  if (clock.weekday === 0 || clock.weekday === 6 || !isEmailConfigured()) return stats

  const users = await listAllAuthUsers(db)
  stats.users = users.length

  for (const user of users) {
    if (!user.email) continue
    try {
      const settings = await getNotificationSettings(db, user.id)
      if (!shouldSendDigest(settings, clock)) continue

      const billing = await requireBillingAccess(db, user.id)
      if (!billing.ok) continue

      const [payload, deadlines] = await Promise.all([
        collectPriorityItems(db, user.id),
        getUpcomingDeadlines(db, user.id),
      ])
      // Rien à signaler : pas d'e-mail (et on réessaiera au prochain passage de la fenêtre d'envoi).
      if (payload.total === 0 && deadlines.length === 0) continue

      const { subject, html } = buildDigestEmail(payload, deadlines, now)
      await sendHtmlEmail({ to: user.email, subject, html })
      await markDigestSent(db, user.id, clock.date)
      await createRecapNotification(db, user.id, payload, deadlines, clock.date)
      stats.sent++
    } catch (e) {
      stats.failed++
      console.error(`[digest] user ${user.id}:`, e instanceof Error ? e.message : e)
    }
  }
  return stats
}

/** Un seul rappel dans la cloche par jour, qui remplace les notifications à répétition. */
async function createRecapNotification(
  db: SupabaseClient,
  userId: string,
  payload: PriorityPayload,
  deadlines: DigestDeadline[],
  date: string,
): Promise<void> {
  const { data: existing } = await db
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'todo_recap')
    .gte('created_at', `${date}T00:00:00`)
    .limit(1)
  if (existing?.length) return

  const bits: string[] = []
  if (payload.counts.quote) bits.push(`${payload.counts.quote} devis`)
  if (payload.counts.question) bits.push(`${payload.counts.question} question${payload.counts.question > 1 ? 's' : ''} fournisseur`)
  if (payload.counts.important) bits.push(`${payload.counts.important} mail${payload.counts.important > 1 ? 's' : ''} important${payload.counts.important > 1 ? 's' : ''}`)
  if (payload.counts.ao_to_create) bits.push(`${payload.counts.ao_to_create} AO à créer`)
  if (deadlines.length) bits.push(`${deadlines.length} échéance${deadlines.length > 1 ? 's' : ''}`)

  await db.from('notifications').insert({
    user_id: userId,
    type: 'todo_recap',
    priority: 'important',
    title: `📋 ${payload.total + deadlines.length} à traiter aujourd'hui`,
    message: bits.join(' · '),
    is_read: false,
  })
}
