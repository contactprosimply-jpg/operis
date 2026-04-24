// ============================================================
// OPERIS — lib/mailer.ts
// Envoi d'emails via Nodemailer (SMTP Gandi)
// ============================================================

import nodemailer from 'nodemailer'

interface SendEmailOptions {
  to: string
  subject: string
  body: string
}

// Créer le transporteur SMTP une seule fois
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'mail.gandi.net',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false, // STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export async function sendEmail({ to, subject, body }: SendEmailOptions): Promise<void> {
  const transporter = createTransporter()

  await transporter.sendMail({
    from: `"Operis" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, '<br>'),
  })
}
