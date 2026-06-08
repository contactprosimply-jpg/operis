import { ImapFlow } from 'imapflow'

export interface MailAccountConfig {
  imap_host: string
  imap_port: number
  imap_user: string
  imap_pass: string
}

export function formatImapError(e: unknown): string {
  const err = e as {
    message?: string
    responseStatus?: string
    responseText?: string
    authenticationFailed?: boolean
    executedCommand?: string
  }
  if (err.authenticationFailed) {
    return 'Identifiants IMAP incorrects — verifiez email et mot de passe dans Parametres > Messagerie'
  }
  const parts = [err.message ?? 'Erreur inconnue']
  if (err.responseStatus) parts.push(`[${err.responseStatus}]`)
  if (err.responseText) parts.push(err.responseText)
  if (err.executedCommand) parts.push(`(commande: ${err.executedCommand})`)
  return parts.join(' ')
}

export function createImapClient(config: MailAccountConfig): ImapFlow {
  const port = Number(config.imap_port) || 993
  return new ImapFlow({
    host: config.imap_host || 'mail.gandi.net',
    port,
    secure: port === 993,
    auth: {
      user: config.imap_user.trim(),
      pass: config.imap_pass,
    },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 25000,
    tls: { minVersion: 'TLSv1.2' },
  })
}

export async function fetchRecentMessages(
  config: MailAccountConfig,
  options: { sinceDays?: number; limit?: number } = {}
): Promise<Array<{ uid: number; source: Buffer }>> {
  const sinceDays = options.sinceDays ?? 30
  const limit = options.limit ?? 40
  const client = createImapClient(config)

  await client.connect()
  const lock = await client.getMailboxLock('INBOX')

  try {
    const since = new Date()
    since.setDate(since.getDate() - sinceDays)

    const uids = await client.search({ since }, { uid: true })
    if (!uids?.length) return []

    const recentUids = uids.slice(-limit)
    const messages: Array<{ uid: number; source: Buffer }> = []

    for await (const message of client.fetch(recentUids, { uid: true, source: true }, { uid: true })) {
      if (message.source) {
        messages.push({ uid: message.uid, source: message.source })
      }
    }

    return messages
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {}
  }
}

export async function testImapConnection(config: MailAccountConfig): Promise<{ exists: number }> {
  const client = createImapClient(config)
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  try {
    return { exists: client.mailbox?.exists ?? 0 }
  } finally {
    lock.release()
    try {
      await client.logout()
    } catch {}
  }
}
