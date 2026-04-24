import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { ImapFlow } from 'imapflow'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { imap_host, imap_port, imap_user, imap_pass } = await req.json()

  if (!imap_host || !imap_user || !imap_pass) {
    return Response.json({ success: false, error: 'Paramètres manquants' }, { status: 400 })
  }

  const client = new ImapFlow({
    host: imap_host,
    port: Number(imap_port) || 993,
    secure: true,
    auth: { user: imap_user, pass: imap_pass },
    logger: false,
  })

  try {
    await client.connect()
    const mailbox = await client.mailboxOpen('INBOX')
    await client.logout()
    return Response.json({ success: true, data: { message: 'Connexion réussie', exists: mailbox.exists } })
  } catch (e: any) {
    return Response.json({ success: false, error: `Connexion échouée : ${e.message}` }, { status: 400 })
  }
}