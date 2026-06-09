import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildEmailWithSignature } from '@/lib/email-compose'

export interface UserMailAttachment {
  filename: string
  content: Buffer
  contentType?: string
}

export interface SendUserEmailOptions {
  to: string
  subject: string
  body: string
  signature?: string
  cc?: string
  attachments?: UserMailAttachment[]
}

export async function getUserMailAccount(db: SupabaseClient, userId: string) {
  const { data: account } = await db
    .from('mail_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (!account?.smtp_user || !account?.smtp_pass) return null
  return account
}

export async function sendUserEmail(
  db: SupabaseClient,
  userId: string,
  opts: SendUserEmailOptions,
): Promise<{ from: string; html: string; text: string }> {
  const account = await getUserMailAccount(db, userId)
  if (!account) {
    throw new Error('Aucun compte mail configuré — Paramètres > Messagerie')
  }

  const signature = opts.signature?.trim() ?? ''
  const { html, text } = buildEmailWithSignature(opts.body, signature)

  const transporter = nodemailer.createTransport({
    host: account.smtp_host || 'mail.gandi.net',
    port: Number(account.smtp_port) || 587,
    secure: false,
    auth: { user: account.smtp_user, pass: account.smtp_pass },
  })

  const fromName = account.smtp_user.split('@')[0]
  await transporter.sendMail({
    from: `"${fromName}" <${account.smtp_user}>`,
    to: opts.to,
    cc: opts.cc || undefined,
    subject: opts.subject,
    text,
    html,
    attachments: opts.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || 'application/octet-stream',
    })),
  })

  return { from: account.smtp_user, html, text }
}
