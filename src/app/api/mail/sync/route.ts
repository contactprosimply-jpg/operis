import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()

  // Récupérer les identifiants IMAP depuis la DB
  const { data: account, error: accountError } = await db
    .from('mail_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  if (accountError || !account) {
    return Response.json({
      success: false,
      error: 'Aucun compte mail configuré. Va dans Paramètres pour configurer ta boîte mail.'
    }, { status: 400 })
  }

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: true,
    auth: { user: account.imap_user, pass: account.imap_pass },
    logger: false,
  })

  const result = { fetched: 0, stored: 0, aoDetected: 0, duplicates: 0, errors: 0 }

  const AO_KEYWORDS = [
    'appel d\'offres', 'appel d\'offre', 'dce', 'rfp', 'consultation',
    'tender', 'bid', 'devis', 'marché', 'cahier des charges', 'ao '
  ]

  try {
    await client.connect()
    await client.mailboxOpen('INBOX')

    // Récupérer uniquement les 20 emails les plus récents
    const messages = client.fetch('*:1', { uid: true, source: true })

    let count = 0
    for await (const message of messages) {
      if (count >= 20) break
      count++

      try {
        const parsed = await simpleParser(message.source)
        const messageId = parsed.messageId ?? `msg-${message.uid}`

        // Vérifier doublon
        const { data: existing } = await db
          .from('emails')
          .select('id')
          .eq('message_id', messageId)
          .single()

        if (existing) { result.duplicates++; continue }

        // Détecter AO
        const text = `${parsed.subject ?? ''} ${parsed.text ?? ''}`.toLowerCase()
        let score = 0
        for (const kw of AO_KEYWORDS) {
          if (text.includes(kw)) score += 20
        }
        score = Math.min(100, score)
        const isAo = score >= 30

        // Stocker
        const { error } = await db.from('emails').insert({
          user_id: userId,
          message_id: messageId,
          subject: parsed.subject ?? '(sans objet)',
          from_address: parsed.from?.text ?? '',
          to_address: parsed.to?.text ?? '',
          body_text: parsed.text ?? '',
          body_html: parsed.html || '',
          received_at: (parsed.date ?? new Date()).toISOString(),
          is_read: false,
          is_ao: isAo,
          ao_score: score,
          tender_id: null,
        })

        if (error) { result.errors++; continue }

        result.stored++
        result.fetched++
        if (isAo) result.aoDetected++

      } catch { result.errors++ }
    }

    // Mettre à jour last_sync
    await db
      .from('mail_accounts')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', account.id)

    await client.logout()
    return Response.json({ success: true, data: result })

  } catch (e: any) {
    return Response.json({ success: false, error: `Erreur IMAP: ${e.message}` }, { status: 500 })
  }
}