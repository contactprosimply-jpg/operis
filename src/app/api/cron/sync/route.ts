import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export const maxDuration = 60

const AO_KEYWORDS = [
  "appel d'offres", "appel d'offre", "dce", "rfp", "consultation",
  "tender", "bid", "devis", "marché", "cahier des charges", "ao "
]

async function syncUser(userId: string, account: any) {
  const db = createAdminClient()
  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: true,
    auth: { user: account.imap_user, pass: account.imap_pass },
    logger: false,
  })

  let stored = 0

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    // Emails des dernières 3 heures
    const since = new Date()
    since.setHours(since.getHours() - 3)

    const messages = client.fetch({ since }, { uid: true, source: true })

    for await (const message of messages) {
      try {
        const parsed = await simpleParser(message.source)
        const messageId = parsed.messageId ?? `msg-${message.uid}`

        const { data: existing } = await db
          .from('emails')
          .select('id')
          .eq('message_id', messageId)
          .single()

        if (existing) continue

        const text = `${parsed.subject ?? ''} ${parsed.text ?? ''}`.toLowerCase()
        let score = 0
        for (const kw of AO_KEYWORDS) { if (text.includes(kw)) score += 20 }
        score = Math.min(100, score)

        await db.from('emails').insert({
          user_id: userId,
          message_id: messageId,
          subject: parsed.subject ?? '(sans objet)',
          from_address: parsed.from?.text ?? '',
          to_address: parsed.to?.text ?? '',
          body_text: parsed.text ?? '',
          body_html: parsed.html || '',
          received_at: (parsed.date ?? new Date()).toISOString(),
          is_read: false,
          is_ao: score >= 30,
          ao_score: score,
          tender_id: null,
        })

        stored++
      } catch { continue }
    }

    await db
      .from('mail_accounts')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', account.id)

    await client.logout()
  } catch (e: any) {
    console.error(`[Cron] Erreur sync user ${userId}:`, e.message)
  }

  return stored
}

export async function GET(req: NextRequest) {
  // Vérifier que c'est bien Vercel qui appelle (sécurité)
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Récupérer tous les comptes mail actifs
  const { data: accounts, error } = await db
    .from('mail_accounts')
    .select('*, profiles!inner(id)')
    .eq('is_active', true)

  if (error || !accounts?.length) {
    return Response.json({ success: true, message: 'Aucun compte à synchroniser' })
  }

  let totalStored = 0
  for (const account of accounts) {
    const userId = account.user_id
    const stored = await syncUser(userId, account)
    totalStored += stored
  }

  console.log(`[Cron] Sync terminée — ${totalStored} nouveaux emails`)
  return Response.json({ success: true, data: { stored: totalStored, accounts: accounts.length } })
}