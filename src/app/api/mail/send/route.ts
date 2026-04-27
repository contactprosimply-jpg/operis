import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import nodemailer from 'nodemailer'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { to, subject, body, cc } = await req.json()

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
    return Response.json({ success: false, error: 'Aucun compte mail configuré' }, { status: 400 })
  }

  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: false,
    auth: { user: account.smtp_user, pass: account.smtp_pass },
  })

  try {
    await transporter.sendMail({
      from: `"Operis" <${account.smtp_user}>`,
      to,
      cc: cc || undefined,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    })
    return Response.json({ success: true, data: { sent: true } })
  } catch (e: any) {
    return Response.json({ success: false, error: `Erreur envoi: ${e.message}` }, { status: 500 })
  }
}