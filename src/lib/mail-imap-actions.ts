import { createImapClient, type MailAccountConfig } from '@/lib/imap-client'

export async function imapMoveMessage(
  config: MailAccountConfig,
  sourceMailbox: string,
  uid: number,
  destMailbox: string,
): Promise<boolean> {
  const client = createImapClient(config)
  await client.connect()
  try {
    const lock = await client.getMailboxLock(sourceMailbox)
    try {
      await client.messageMove(uid, destMailbox, { uid: true })
      return true
    } finally {
      lock.release()
    }
  } catch (e) {
    console.error('[IMAP move]', e)
    return false
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

export async function imapDeleteMessages(
  config: MailAccountConfig,
  mailboxPath: string,
  uids: number[],
): Promise<boolean> {
  if (!uids.length) return true
  const client = createImapClient(config)
  await client.connect()
  try {
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      await client.messageDelete(uids, { uid: true })
      return true
    } finally {
      lock.release()
    }
  } catch (e) {
    console.error('[IMAP delete]', e)
    return false
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

export async function imapCreateMailbox(
  config: MailAccountConfig,
  path: string,
): Promise<{ path: string; created: boolean } | null> {
  const client = createImapClient(config)
  await client.connect()
  try {
    const result = await client.mailboxCreate(path)
    return { path: result.path, created: result.created }
  } catch (e) {
    console.error('[IMAP create mailbox]', e)
    return null
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

export async function imapDeleteMailbox(
  config: MailAccountConfig,
  path: string,
): Promise<boolean> {
  const client = createImapClient(config)
  await client.connect()
  try {
    await client.mailboxDelete(path)
    return true
  } catch (e) {
    console.error('[IMAP delete mailbox]', e)
    return false
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

export async function imapGetMailboxDelimiter(config: MailAccountConfig): Promise<string> {
  const client = createImapClient(config)
  await client.connect()
  try {
    const mailboxes = await client.list()
    return mailboxes[0]?.delimiter ?? '.'
  } catch {
    return '.'
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}

export async function imapSetSeen(
  config: MailAccountConfig,
  mailboxPath: string,
  uid: number,
  seen: boolean,
): Promise<boolean> {
  const client = createImapClient(config)
  await client.connect()
  try {
    const lock = await client.getMailboxLock(mailboxPath)
    try {
      if (seen) {
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
      } else {
        await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true })
      }
      return true
    } finally {
      lock.release()
    }
  } catch (e) {
    console.error('[IMAP seen]', e)
    return false
  } finally {
    try { await client.logout() } catch { /* ignore */ }
  }
}
