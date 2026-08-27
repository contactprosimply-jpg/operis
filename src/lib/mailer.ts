// ============================================================
// OPERIS — lib/mailer.ts
// Envoi d'emails transactionnels via Resend
// ============================================================

import { Resend } from 'resend'

const FROM_ADDRESS = 'contact@operis-pro.com'

// Adresse de réponse : configurable par variable d'environnement, pour pouvoir
// la faire pointer vers une boîte réellement surveillée sans toucher au code
// (ex : tant que contact@operis-pro.com n'est pas encore une boîte suivie).
function replyTo(): string | undefined {
  return process.env.MAIL_REPLY_TO || undefined
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

let client: Resend | null = null
function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY manquant — envoi d\'email impossible')
  if (!client) client = new Resend(apiKey)
  return client
}

interface SendEmailOptions {
  to: string
  subject: string
  body: string
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>
}

export async function sendEmail({ to, subject, body, attachments }: SendEmailOptions): Promise<void> {
  const resend = getClient()
  const { error } = await resend.emails.send({
    from: `Operis <${FROM_ADDRESS}>`,
    replyTo: replyTo(),
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, '<br>'),
    attachments: attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType || 'application/octet-stream',
    })),
  })
  if (error) throw new Error(`Resend: ${error.message}`)
}

export async function sendHtmlEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  const resend = getClient()
  const { error } = await resend.emails.send({
    from: `Operis Alertes <${FROM_ADDRESS}>`,
    replyTo: replyTo(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  })
  if (error) throw new Error(`Resend: ${error.message}`)
}
