import type { SupabaseClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { extractEmailAddress } from '@/lib/mail-attachments'
import { attachmentMetaOnly, persistAttachmentsToStorage } from '@/lib/mail-storage'
import { upsertContactsFromOutboundSend } from '@/lib/contacts'
import { sitePath } from '@/lib/site-url'

export interface PendingMailPayload {
  toAddress: string
  cc?: string
  bcc?: string
  subject: string
  bodyText: string
  bodyHtml: string
  attachments: Array<{ filename: string; contentType?: string; data: string; size?: number }>
  tenderId?: string | null
  supplierId?: string | null
}

/** Un contact déjà échangé au moins une fois (email_count > 0) n'a pas besoin de vérification. */
export async function isFirstTimeContact(
  db: SupabaseClient,
  userId: string,
  toAddress: string,
): Promise<boolean> {
  const email = extractEmailAddress(toAddress) || toAddress.trim().toLowerCase()
  if (!email) return false
  const { data } = await db
    .from('contacts')
    .select('email_count')
    .eq('user_id', userId)
    .eq('email', email)
    .maybeSingle()
  return !data || (data.email_count ?? 0) === 0
}

async function getSmtpTransport(db: SupabaseClient, userId: string) {
  const { data: account } = await db
    .from('mail_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (!account?.smtp_user || !account?.smtp_pass) return null
  const transporter = nodemailer.createTransport({
    host: account.smtp_host || 'mail.gandi.net',
    port: Number(account.smtp_port) || 587,
    secure: false,
    auth: { user: account.smtp_user, pass: account.smtp_pass },
  })
  return { transporter, account }
}

/** Met le mail réel en attente et envoie le mail-défi de vérification humaine. */
export async function queueVerificationChallenge(
  db: SupabaseClient,
  userId: string,
  payload: PendingMailPayload,
): Promise<{ success: boolean; error?: string }> {
  const smtp = await getSmtpTransport(db, userId)
  if (!smtp) return { success: false, error: 'Aucun compte mail configuré' }

  const { data: pending, error } = await db
    .from('pending_mail_verifications')
    .insert({
      user_id: userId,
      to_address: payload.toAddress,
      cc: payload.cc || null,
      bcc: payload.bcc || null,
      subject: payload.subject,
      body_text: payload.bodyText,
      body_html: payload.bodyHtml,
      attachments: payload.attachments,
      tender_id: payload.tenderId || null,
      supplier_id: payload.supplierId || null,
    })
    .select('id')
    .single()

  if (error || !pending) return { success: false, error: error?.message ?? 'Erreur création vérification' }

  const verifyUrl = sitePath(`/verifier/${pending.id}`)
  const fromName = smtp.account.smtp_user.split('@')[0]

  try {
    await smtp.transporter.sendMail({
      from: `"${fromName}" <${smtp.account.smtp_user}>`,
      to: payload.toAddress,
      subject: `Un message vous attend — ${payload.subject}`,
      text: `${fromName} vous a envoyé un message via Operis.\n\nPour des raisons de sécurité (protection anti-robot), veuillez confirmer que vous êtes bien humain en cliquant sur ce lien pour recevoir le message :\n${verifyUrl}\n\nCe lien expire dans 7 jours.`,
      html: `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">
        <p>${fromName} vous a envoyé un message via Operis.</p>
        <p>Pour des raisons de sécurité (protection anti-robot), veuillez confirmer que vous êtes bien humain en cliquant sur le bouton ci-dessous pour recevoir le message :</p>
        <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#021246;color:#fff;border-radius:8px;text-decoration:none;">Recevoir le message</a></p>
        <p style="font-size:12px;color:#9ca3af;">Ce lien expire dans 7 jours.</p>
      </div>`,
    })
  } catch (e: unknown) {
    await db.from('pending_mail_verifications').delete().eq('id', pending.id)
    const msg = e instanceof Error ? e.message : 'Erreur envoi'
    return { success: false, error: msg }
  }

  return { success: true }
}

/** Envoie le mail réel après confirmation humaine du destinataire. */
export async function deliverPendingMail(
  db: SupabaseClient,
  token: string,
): Promise<{ success: boolean; error?: string; alreadyVerified?: boolean }> {
  const { data: pending } = await db
    .from('pending_mail_verifications')
    .select('*')
    .eq('id', token)
    .maybeSingle()

  if (!pending) return { success: false, error: 'Lien invalide ou expiré' }
  if (pending.verified_at) return { success: true, alreadyVerified: true }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    return { success: false, error: 'Ce lien a expiré' }
  }

  const smtp = await getSmtpTransport(db, pending.user_id)
  if (!smtp) return { success: false, error: 'Compte mail expéditeur introuvable' }

  const attachments = (pending.attachments as PendingMailPayload['attachments']) ?? []
  const fromName = smtp.account.smtp_user.split('@')[0]

  try {
    await smtp.transporter.sendMail({
      from: `"${fromName}" <${smtp.account.smtp_user}>`,
      to: pending.to_address,
      cc: pending.cc || undefined,
      bcc: pending.bcc || undefined,
      subject: pending.subject,
      text: pending.body_text,
      html: pending.body_html,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.data, 'base64'),
        contentType: a.contentType || 'application/octet-stream',
      })),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur envoi'
    return { success: false, error: msg }
  }

  const sentAt = new Date().toISOString()
  const sentEmailId = crypto.randomUUID()

  const { error: insertErr } = await db.from('emails').insert({
    id: sentEmailId,
    user_id: pending.user_id,
    message_id: `sent-${pending.user_id}-${Date.now()}`,
    subject: pending.subject,
    from_address: smtp.account.smtp_user,
    to_address: pending.to_address,
    body_text: pending.body_text,
    body_html: pending.body_html,
    received_at: sentAt,
    is_read: true,
    is_ao: false,
    ao_score: 0,
    tender_id: pending.tender_id,
    attachments: [],
    has_attachments: attachments.length > 0,
    mail_folder: 'sent',
    cc_address: pending.cc,
    bcc_address: pending.bcc,
  })

  if (!insertErr && attachments.length > 0) {
    try {
      const normalizedAttachments = attachments.map(a => ({
        filename: a.filename,
        contentType: a.contentType || 'application/octet-stream',
        size: a.size ?? Buffer.from(a.data, 'base64').length,
        data: a.data,
      }))
      const stored = await persistAttachmentsToStorage(db, pending.user_id, sentEmailId, normalizedAttachments)
      const meta = stored.map(attachmentMetaOnly)
      await db.from('emails').update({ attachments: meta, has_attachments: meta.length > 0 }).eq('id', sentEmailId)
    } catch { /* pièces jointes best-effort */ }
  }

  await db.from('email_logs').insert({
    user_id: pending.user_id,
    type: 'outbound',
    to_address: pending.to_address,
    subject: pending.subject,
    body: pending.body_text,
    sent_at: sentAt,
    success: true,
    error_message: null,
    tender_id: pending.tender_id,
  })

  await upsertContactsFromOutboundSend(
    db, pending.user_id, pending.to_address, pending.cc ?? undefined, pending.bcc ?? undefined,
    pending.tender_id, sentAt,
  )

  if (pending.tender_id && pending.supplier_id) {
    await db
      .from('consultation_suppliers')
      .update({ status: 'envoye', last_sent_at: sentAt })
      .eq('tender_id', pending.tender_id)
      .eq('supplier_id', pending.supplier_id)
      .eq('status', 'en_attente')
  }

  await db.from('pending_mail_verifications').update({ verified_at: sentAt }).eq('id', token)

  return { success: true }
}
