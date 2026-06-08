// ============================================================
// OPERIS — services/imap.service.ts
// Connexion IMAP Gandi + lecture emails
// ============================================================

import { simpleParser, ParsedMail } from 'mailparser'
import { fetchRecentMessages, type MailAccountConfig } from '@/lib/imap-client'

export interface RawEmail {
  messageId: string
  subject: string
  from: string
  to: string
  bodyText: string
  bodyHtml: string
  receivedAt: Date
}

function getEnvMailConfig(): MailAccountConfig {
  return {
    imap_host: process.env.IMAP_HOST ?? 'mail.gandi.net',
    imap_port: Number(process.env.IMAP_PORT ?? 993),
    imap_user: process.env.IMAP_USER!,
    imap_pass: process.env.IMAP_PASS!,
  }
}

async function parseMessages(messages: Array<{ uid: number; source: Buffer }>): Promise<RawEmail[]> {
  const emails: RawEmail[] = []

  for (const message of messages) {
    try {
      const parsed: ParsedMail = await simpleParser(message.source)
      emails.push({
        messageId: parsed.messageId ?? `msg-${message.uid}`,
        subject: parsed.subject ?? '(sans objet)',
        from: parsed.from?.text ?? '',
        to: parsed.to?.text ?? '',
        bodyText: parsed.text ?? '',
        bodyHtml: parsed.html || '',
        receivedAt: parsed.date ?? new Date(),
      })
    } catch (parseError) {
      console.error(`[IMAP] Erreur parsing email ${message.uid}:`, parseError)
    }
  }

  return emails
}

// ── Récupérer les emails non lus ─────────────────────────────
export async function fetchUnreadEmails(limit = 50): Promise<RawEmail[]> {
  const config = getEnvMailConfig()
  const messages = await fetchRecentMessages(config, { sinceDays: 30, limit })
  const emails = await parseMessages(messages)
  return emails.slice(0, limit)
}

// ── Récupérer les emails depuis une date donnée ───────────────
export async function fetchEmailsSince(since: Date, limit = 100): Promise<RawEmail[]> {
  const config = getEnvMailConfig()
  const days = Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86400000))
  const messages = await fetchRecentMessages(config, { sinceDays: days, limit })
  return parseMessages(messages)
}
