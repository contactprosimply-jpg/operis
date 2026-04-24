// ============================================================
// OPERIS — services/mailSync.service.ts
// Orchestre : IMAP → détection AO → stockage Supabase
// ============================================================

import { fetchUnreadEmails, fetchEmailsSince } from './imap.service'
import { detectAo, extractTenderTitle, extractClientFromEmail } from './aoDetector.service'
import { createAdminClient } from '@/lib/supabase'
import { Email } from '@/types/database'

export interface SyncResult {
  fetched: number        // emails récupérés depuis IMAP
  stored: number         // emails stockés en DB
  aoDetected: number     // emails détectés comme AO
  duplicates: number     // emails déjà connus (ignorés)
  errors: number
}

// ── Synchronisation principale ────────────────────────────────
export async function syncMailbox(userId: string, since?: Date): Promise<SyncResult> {
  const result: SyncResult = {
    fetched: 0,
    stored: 0,
    aoDetected: 0,
    duplicates: 0,
    errors: 0,
  }

  try {
    // 1. Récupérer les emails depuis IMAP
    const rawEmails = since
      ? await fetchEmailsSince(since)
      : await fetchUnreadEmails(50)

    result.fetched = rawEmails.length

    const db = createAdminClient()

    for (const raw of rawEmails) {
      try {
        // 2. Vérifier si l'email existe déjà (éviter les doublons)
        const { data: existing } = await db
          .from('emails')
          .select('id')
          .eq('message_id', raw.messageId)
          .single()

        if (existing) {
          result.duplicates++
          continue
        }

        // 3. Détecter si c'est un AO
        const detection = detectAo(raw.subject, raw.bodyText)

        // 4. Stocker en base
        const { error } = await db.from('emails').insert({
          user_id: userId,
          message_id: raw.messageId,
          subject: raw.subject,
          from_address: raw.from,
          to_address: raw.to,
          body_text: raw.bodyText,
          body_html: raw.bodyHtml,
          received_at: raw.receivedAt.toISOString(),
          is_read: false,
          is_ao: detection.isAo,
          ao_score: detection.score,
          tender_id: null,
        })

        if (error) {
          console.error('[MailSync] Erreur insertion:', error.message)
          result.errors++
          continue
        }

        result.stored++
        if (detection.isAo) result.aoDetected++

      } catch (emailError: any) {
        console.error('[MailSync] Erreur traitement email:', emailError.message)
        result.errors++
      }
    }

    return result

  } catch (imapError: any) {
    console.error('[MailSync] Erreur IMAP:', imapError.message)
    throw new Error(`Erreur connexion IMAP: ${imapError.message}`)
  }
}

// ── Récupérer les emails depuis la DB ─────────────────────────
export async function getEmails(
  userId: string,
  filters: { isAo?: boolean; isRead?: boolean } = {}
): Promise<Email[]> {
  const db = createAdminClient()

  let query = db
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .order('received_at', { ascending: false })

  if (filters.isAo !== undefined) {
    query = query.eq('is_ao', filters.isAo)
  }
  if (filters.isRead !== undefined) {
    query = query.eq('is_read', filters.isRead)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as Email[]
}

// ── Créer un AO directement depuis un email ──────────────────
export async function createTenderFromEmail(
  emailId: string,
  userId: string
): Promise<{ tender_id: string } | null> {
  const db = createAdminClient()

  // Récupérer l'email
  const { data: email, error } = await db
    .from('emails')
    .select('*')
    .eq('id', emailId)
    .eq('user_id', userId)
    .single()

  if (error || !email) return null

  // Créer l'AO avec les infos extraites de l'email
  const title = extractTenderTitle(email.subject ?? '')
  const client = extractClientFromEmail(email.from_address ?? '')

  const { data: tender, error: tenderError } = await db
    .from('tenders')
    .insert({
      user_id: userId,
      title,
      client,
      description: email.body_text?.slice(0, 500) ?? '',
      status: 'nouveau' as const,
      source_email_id: emailId,
    })
    .select()
    .single()

  if (tenderError || !tender) return null

  // Lier l'email à l'AO créé
  await db
    .from('emails')
    .update({ tender_id: tender.id, is_read: true })
    .eq('id', emailId)

  return { tender_id: tender.id }
}

// ── Marquer un email comme lu ─────────────────────────────────
export async function markEmailAsRead(emailId: string, userId: string): Promise<void> {
  const db = createAdminClient()
  await db
    .from('emails')
    .update({ is_read: true })
    .eq('id', emailId)
    .eq('user_id', userId)
}
