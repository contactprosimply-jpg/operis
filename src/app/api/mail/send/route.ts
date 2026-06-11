export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import nodemailer from 'nodemailer'
import { clampString, rejectUnexpectedFields } from '@/lib/api-validation'
import { resolveMailAccount } from '@/lib/mail-sync'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const rawBody = await req.json()
  const unexpected = rejectUnexpectedFields(rawBody as Record<string, unknown>, [
    'to', 'subject', 'body', 'cc', 'signature', 'attachments',
  ])
  if (unexpected) {
    return Response.json({ success: false, error: unexpected }, { status: 400 })
  }

  const { to, subject, body, cc, signature, attachments: rawAttachments } = rawBody

  const bodyText = clampString(body, 100000) ?? ''
  const signatureText = (clampString(signature, 10000) ?? '').trim()
  const subjectText = clampString(subject, 200) ?? ''
  const toText = typeof to === 'string' ? to.slice(0, 500) : ''

  if (!toText || !subjectText) {
    return Response.json({ success: false, error: 'Destinataire et sujet requis' }, { status: 400 })
  }
  if (!bodyText.trim() && !signatureText) {
    return Response.json({ success: false, error: 'Message ou signature requis' }, { status: 400 })
  }

  const mailCfg = await resolveMailAccount(userId)
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

  const bodyHtml = bodyText.replace(/\n/g, '<br>')

  let finalHtml: string
  let finalText: string

  if (signatureText) {
    const isHtmlSignature = signatureText.includes('<') && signatureText.includes('>')
    const bodyBlock = bodyText.trim()
      ? `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">${bodyHtml}</div>`
      : ''

    if (isHtmlSignature) {
      finalHtml = `${bodyBlock}${bodyBlock ? '<br>' : ''}<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">${signatureText}`
      finalText = bodyText.trim()
        ? `${bodyText}\n\n--\n${signatureText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`
        : signatureText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    } else {
      finalHtml = `${bodyBlock}${bodyBlock ? '<br>' : ''}<hr style="border: none; border-top: 1px solid var(--border); margin: 16px 0;"><div style="font-family: DM Sans, Arial, sans-serif; font-size: 12px; color: #6b7280; line-height: 1.6;">${signatureText.replace(/\n/g, '<br>')}</div>`
      finalText = bodyText.trim() ? `${bodyText}\n\n--\n${signatureText}` : signatureText
    }
  } else {
    finalHtml = `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">${bodyHtml}</div>`
    finalText = bodyText
  }

  const mailAttachments = Array.isArray(rawAttachments)
    ? rawAttachments
        .filter((a: { data?: string; filename?: string }) => a?.data && a?.filename)
        .map((a: { filename: string; contentType?: string; data: string }) => ({
          filename: a.filename,
          content: Buffer.from(a.data, 'base64'),
          contentType: a.contentType || 'application/octet-stream',
        }))
    : []

  try {
    await transporter.sendMail({
      from: `"${account.smtp_user.split('@')[0]}" <${account.smtp_user}>`,
      to: toText,
      cc: typeof cc === 'string' ? cc.slice(0, 500) : undefined,
      subject: subjectText,
      text: finalText,
      html: finalHtml,
      attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
    })

    const { error: logError } = await db.from('email_logs').insert({
      type: 'consultation',
      to_address: toText,
      subject: subjectText,
      body: finalText,
      sent_at: new Date().toISOString(),
      success: true,
      error_message: null,
    })
    if (logError) console.error('[Mail] Log envoi:', logError.message)

    return Response.json({ success: true, data: { sent: true, from: account.smtp_user } })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue'
    return Response.json({ success: false, error: `Erreur envoi: ${message}` }, { status: 500 })
  }
}
