export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import nodemailer from 'nodemailer'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { to, subject, body, cc, signature } = await req.json()

  if (!to || !subject || !body) {
    return Response.json({ success: false, error: 'Destinataire, sujet et corps requis' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: account, error } = await db
    .from('mail_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  if (error || !account) {
    return Response.json({ success: false, error: 'Aucun compte mail configurÃ©' }, { status: 400 })
  }

  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: false,
    auth: { user: account.smtp_user, pass: account.smtp_pass },
  })

  // â”€â”€ Construction du HTML avec signature injectÃ©e â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Le body texte est converti en HTML puis la signature est ajoutÃ©e
  const bodyHtml = body.replace(/\n/g, '<br>')

  let finalHtml: string
  let finalText: string

  if (signature && signature.trim()) {
    // Signature HTML fournie : l'injecter aprÃ¨s le body avec un sÃ©parateur
    const isHtmlSignature = signature.includes('<') && signature.includes('>')
    
    if (isHtmlSignature) {
      // Signature HTML : injecter directement
      finalHtml = `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">${bodyHtml}</div>
<br>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
${signature}`
      finalText = `${body}\n\n--\n${signature.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`
    } else {
      // Signature texte : convertir en HTML
      finalHtml = `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">${bodyHtml}</div>
<br>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
<div style="font-family: DM Sans, Arial, sans-serif; font-size: 12px; color: #6b7280; line-height: 1.6;">${signature.replace(/\n/g, '<br>')}</div>`
      finalText = `${body}\n\n--\n${signature}`
    }
  } else {
    // Pas de signature
    finalHtml = `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">${bodyHtml}</div>`
    finalText = body
  }

  try {
    await transporter.sendMail({
      from: `"${account.smtp_user.split('@')[0]}" <${account.smtp_user}>`,
      to,
      cc: cc || undefined,
      subject,
      text: finalText,
      html: finalHtml,
    })

    // Logger l'envoi
    await db.from('email_logs').insert({
      type: 'consultation',
      to_address: to,
      subject,
      body: finalText,
      sent_at: new Date().toISOString(),
      success: true,
      error_message: null,
    }).catch(() => {}) // Ne pas bloquer si le log Ã©choue

    return Response.json({ success: true, data: { sent: true } })
  } catch (e: any) {
    return Response.json({ success: false, error: `Erreur envoi: ${e.message}` }, { status: 500 })
  }
}

