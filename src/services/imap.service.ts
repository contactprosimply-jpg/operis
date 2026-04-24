// ============================================================
// OPERIS — services/imap.service.ts
// Connexion IMAP Gandi + lecture emails
// ============================================================

import { ImapFlow } from 'imapflow'
import { simpleParser, ParsedMail } from 'mailparser'

export interface RawEmail {
  messageId: string
  subject: string
  from: string
  to: string
  bodyText: string
  bodyHtml: string
  receivedAt: Date
}

// ── Créer le client IMAP ─────────────────────────────────────
function createImapClient(): ImapFlow {
  return new ImapFlow({
    host: process.env.IMAP_HOST ?? 'mail.gandi.net',
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: {
      user: process.env.IMAP_USER!,
      pass: process.env.IMAP_PASS!,
    },
    logger: false, // désactiver les logs IMAP en prod
  })
}

// ── Récupérer les emails non lus ─────────────────────────────
export async function fetchUnreadEmails(limit = 50): Promise<RawEmail[]> {
  const client = createImapClient()
  const emails: RawEmail[] = []

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    // Chercher les emails non lus
    const messages = client.fetch('1:*', {
      uid: true,
      flags: true,
      envelope: true,
      source: true,
    })

    let count = 0
    for await (const message of messages) {
      if (count >= limit) break

      // Passer les emails déjà lus
      if (message.flags.has('\\Seen')) continue

      try {
        // Parser le contenu de l'email
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

        count++
      } catch (parseError) {
        console.error(`[IMAP] Erreur parsing email ${message.uid}:`, parseError)
      }
    }

    return emails
  } finally {
    // Toujours fermer la connexion
    await client.logout()
  }
}

// ── Récupérer les emails depuis une date donnée ───────────────
export async function fetchEmailsSince(since: Date, limit = 100): Promise<RawEmail[]> {
  const client = createImapClient()
  const emails: RawEmail[] = []

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    const messages = client.fetch(
      { since },
      { uid: true, envelope: true, source: true }
    )

    let count = 0
    for await (const message of messages) {
      if (count >= limit) break
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
        count++
      } catch (e) {
        console.error('[IMAP] Erreur parsing:', e)
      }
    }

    return emails
  } finally {
    await client.logout()
  }
}
