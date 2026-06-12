export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserEmailFromRequest, getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import nodemailer from 'nodemailer'
import { clampString, rejectUnexpectedFields } from '@/lib/api-validation'
import { resolveMailAccount } from '@/lib/mail-sync'
import { normalizeMessageId } from '@/lib/mail-message-id'
import { applySmartLabels } from '@/lib/mail-smart-labels'
import { isValidUuid } from '@/lib/api-validation'
import { attachmentMetaOnly, persistAttachmentsToStorage } from '@/lib/mail-storage'
import {
  persistMailLinkedDocuments,
  resolveTenderIdFromSubject,
} from '@/lib/tender-documents'
export const maxDuration = 30

async function resolveTenderIdForSend(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  opts: {
    tenderId?: string
    replyId?: string
    forwardId?: string
    subject: string
  },
): Promise<string | null> {
  if (opts.tenderId && isValidUuid(opts.tenderId)) {
    const { data } = await db
      .from('tenders')
      .select('id')
      .eq('id', opts.tenderId)
      .eq('user_id', userId)
      .maybeSingle()
    if (data?.id) return data.id
  }

  if (opts.replyId) {
    const { data } = await db
      .from('emails')
      .select('tender_id')
      .eq('id', opts.replyId)
      .eq('user_id', userId)
      .maybeSingle()
    if (data?.tender_id) return data.tender_id
  }

  if (opts.forwardId) {
    const { data } = await db
      .from('emails')
      .select('tender_id')
      .eq('id', opts.forwardId)
      .eq('user_id', userId)
      .maybeSingle()
    if (data?.tender_id) return data.tender_id
  }

  return await resolveTenderIdFromSubject(db, userId, opts.subject)
}

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()
  const loginEmail = await getUserEmailFromRequest(req)

  const rawBody = await req.json()
  const unexpected = rejectUnexpectedFields(rawBody as Record<string, unknown>, [
    'to', 'subject', 'body', 'cc', 'bcc', 'signature', 'attachments',
    'replyToEmailId', 'forwardFromEmailId', 'tenderId',
  ])
  if (unexpected) {
    return Response.json({ success: false, error: unexpected }, { status: 400 })
  }

  const {
    to,
    subject,
    body,
    cc,
    bcc,
    signature,
    attachments: rawAttachments,
    replyToEmailId,
    forwardFromEmailId,
    tenderId: rawTenderId,
  } = rawBody

  const bodyText = clampString(body, 100000) ?? ''
  const signatureText = (clampString(signature, 100000) ?? '').trim()
  const subjectText = clampString(subject, 200) ?? ''
  const toText = typeof to === 'string' ? to.slice(0, 500) : ''

  if (!toText || !subjectText) {
    return Response.json({ success: false, error: 'Destinataire et sujet requis' }, { status: 400 })
  }
  if (!bodyText.trim() && !signatureText) {
    return Response.json({ success: false, error: 'Message ou signature requis' }, { status: 400 })
  }

  const mailCfg = await resolveMailAccount(userId, { loginEmail })
  if (!mailCfg?.id) {
    return Response.json({ success: false, error: 'Aucun compte mail configure' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: account, error } = await db
    .from('mail_accounts')
    .select('*')
    .eq('id', mailCfg.id)
    .single()

  if (error || !account) {
    return Response.json({ success: false, error: 'Aucun compte mail configure' }, { status: 400 })
  }

  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: false,
    auth: { user: account.smtp_user, pass: account.smtp_pass },
  })

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(bodyText.trim())
  const bodyHtml = looksLikeHtml ? bodyText : bodyText.replace(/\n/g, '<br>')
  const bodyPlain = looksLikeHtml
    ? bodyText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : bodyText

  let finalHtml: string
  let finalText: string

  if (signatureText) {
    const isHtmlSignature = signatureText.includes('<') && signatureText.includes('>')
    const bodyBlock = bodyText.trim()
      ? looksLikeHtml
        ? `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">${bodyHtml}</div>`
        : `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">${bodyHtml}</div>`
      : ''

    if (isHtmlSignature) {
      finalHtml = `${bodyBlock}${bodyBlock ? '<br>' : ''}<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">${signatureText}`
      finalText = bodyPlain.trim()
        ? `${bodyPlain}\n\n--\n${signatureText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`
        : signatureText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    } else {
      finalHtml = `${bodyBlock}${bodyBlock ? '<br>' : ''}<hr style="border: none; border-top: 1px solid var(--border); margin: 16px 0;"><div style="font-family: DM Sans, Arial, sans-serif; font-size: 12px; color: #6b7280; line-height: 1.6;">${signatureText.replace(/\n/g, '<br>')}</div>`
      finalText = bodyPlain.trim() ? `${bodyPlain}\n\n--\n${signatureText}` : signatureText
    }
  } else {
    finalHtml = `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">${bodyHtml}</div>`
    finalText = bodyPlain
  }

  const mailAttachments = Array.isArray(rawAttachments)
    ? rawAttachments
        .filter((a: { data?: string; filename?: string }) => a?.data && a?.filename)
        .map((a: { filename: string; contentType?: string; data: string; size?: number }) => ({
          filename: a.filename,
          content: Buffer.from(a.data, 'base64'),
          contentType: a.contentType || 'application/octet-stream',
          size: a.size,
        }))
    : []

  let inReplyToHeader: string | undefined
  let resolvedReplyId = typeof replyToEmailId === 'string' && isValidUuid(replyToEmailId)
    ? replyToEmailId
    : undefined

  if (!resolvedReplyId && /^re:/i.test(subjectText.trim())) {
    const baseSubject = subjectText.replace(/^re:\s*/i, '').trim()
    const { data: bySubject } = await db
      .from('emails')
      .select('id, message_id, subject')
      .eq('user_id', userId)
      .eq('mail_folder', 'inbox')
      .ilike('subject', baseSubject)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (bySubject?.id) resolvedReplyId = bySubject.id
  }

  if (resolvedReplyId) {
    const { data: orig } = await db
      .from('emails')
      .select('message_id')
      .eq('id', resolvedReplyId)
      .eq('user_id', userId)
      .maybeSingle()
    if (orig?.message_id) inReplyToHeader = orig.message_id
  }

  const forwardId = typeof forwardFromEmailId === 'string' && isValidUuid(forwardFromEmailId)
    ? forwardFromEmailId
    : undefined

  const resolvedTenderId = await resolveTenderIdForSend(db, userId, {
    tenderId: typeof rawTenderId === 'string' ? rawTenderId : undefined,
    replyId: resolvedReplyId,
    forwardId,
    subject: subjectText,
  })

  try {
    const info = await transporter.sendMail({
      from: `"${account.smtp_user.split('@')[0]}" <${account.smtp_user}>`,
      to: toText,
      cc: typeof cc === 'string' ? cc.slice(0, 500) : undefined,
      bcc: typeof bcc === 'string' ? bcc.slice(0, 500) : undefined,
      subject: subjectText,
      text: finalText,
      html: finalHtml,
      inReplyTo: inReplyToHeader,
      references: inReplyToHeader,
      attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
    })

    const sentAt = new Date().toISOString()
    const messageId = normalizeMessageId(info.messageId, `sent-${userId}-${Date.now()}`)
    const sentEmailId = crypto.randomUUID()

    const attachmentMeta = mailAttachments.map(a => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size ?? a.content.length,
      data: a.content.toString('base64'),
    }))

    const sentInsert: Record<string, unknown> = {
      id: sentEmailId,
      user_id: userId,
      message_id: messageId,
      subject: subjectText,
      from_address: account.smtp_user,
      to_address: toText,
      body_text: finalText,
      body_html: finalHtml,
      received_at: sentAt,
      is_read: true,
      is_ao: false,
      ao_score: 0,
      tender_id: resolvedTenderId,
      attachments: [],
      has_attachments: mailAttachments.length > 0,
      mail_folder: 'sent',
    }

    let { error: sentEmailError } = await db.from('emails').insert(sentInsert)

    if (sentEmailError && !sentEmailError.message.includes('duplicate key')) {
      const fallback = { ...sentInsert }
      delete fallback.mail_folder
      delete fallback.attachments
      delete fallback.has_attachments
      const retry = await db.from('emails').insert(fallback)
      sentEmailError = retry.error
    }

    if (!sentEmailError && mailAttachments.length > 0) {
      try {
        const stored = await persistAttachmentsToStorage(
          db,
          userId,
          sentEmailId,
          attachmentMeta,
        )
        const meta = stored.map(attachmentMetaOnly)
        await db.from('emails').update({
          attachments: meta,
          has_attachments: meta.length > 0,
        }).eq('id', sentEmailId)
      } catch (attErr) {
        console.error('[Mail] persist sent attachments:', attErr)
      }
    }

    if (resolvedTenderId && !sentEmailError) {
      try {
        await persistMailLinkedDocuments(db, userId, resolvedTenderId, sentEmailId)
      } catch (docErr) {
        console.error('[Mail] persist tender docs from sent:', docErr)
      }
    }

    const { error: logError } = await db.from('email_logs').insert({
      user_id: userId,
      type: 'outbound',
      to_address: toText,
      subject: subjectText,
      body: finalText,
      sent_at: sentAt,
      success: true,
      error_message: null,
      tender_id: resolvedTenderId,
    })
    if (logError) console.error('[Mail] Log envoi:', logError.message)

    const smartLabelUpdates: Array<{ emailId: string; labels: unknown }> = []
    if (resolvedReplyId) {
      const labels = await applySmartLabels(db, userId, resolvedReplyId, 'replied')
      if (labels) smartLabelUpdates.push({ emailId: resolvedReplyId, labels })
    }
    if (forwardId) {
      const labels = await applySmartLabels(db, userId, forwardId, 'forwarded')
      if (labels) smartLabelUpdates.push({ emailId: forwardId, labels })
    }

    return Response.json({
      success: true,
      data: {
        sent: true,
        from: account.smtp_user,
        smartLabelUpdates,
        tenderId: resolvedTenderId,
        sentEmailId,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    return Response.json({ success: false, error: `Erreur envoi: ${message}` }, { status: 500 })
  }
}
