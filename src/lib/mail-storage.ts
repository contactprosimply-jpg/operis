import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredEmailAttachment } from '@/lib/mail-attachments'
import { checkStorageQuota } from '@/lib/billing/subscription'

export const MAIL_ATTACHMENTS_BUCKET = 'mail-attachments'

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'fichier'
}

export function attachmentMetaOnly(att: StoredEmailAttachment) {
  return {
    filename: att.filename,
    contentType: att.contentType,
    size: att.size,
    path: att.path,
    hasData: !!(att.path || att.data),
    contentDisposition: att.contentDisposition,
    contentId: att.contentId,
  } as StoredEmailAttachment & { hasData: boolean }
}

export async function persistAttachmentsToStorage(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  attachments: StoredEmailAttachment[],
): Promise<StoredEmailAttachment[]> {
  const stored: StoredEmailAttachment[] = []

  // Quota lu une seule fois pour tout le batch, puis suivi au fil des pièces jointes (un
  // mail peut en contenir plusieurs). Ne bloque jamais la synchro : en cas d'échec de lecture
  // du contexte de facturation, on n'applique aucune limite plutôt que de risquer de perdre
  // des mails à cause d'un souci billing.
  let usedBytes = 0
  let limitBytes = Infinity
  try {
    const quota = await checkStorageQuota(db, userId, 0)
    usedBytes = quota.ctx.storageBytes
    limitBytes = quota.limitBytes
  } catch (err) {
    console.error('[Mail storage] checkStorageQuota:', err instanceof Error ? err.message : err)
  }
  let projectedBytes = usedBytes

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i]
    const path = `${userId}/${emailId}/${i}-${safeFilename(att.filename)}`
    const size = att.size || 0
    const wouldExceed = projectedBytes + size > limitBytes
    projectedBytes += size

    // Quota dépassé : on n'écrit ni dans Storage ni dans le fallback base64 ci-dessous (qui
    // stockerait quand même les octets en base pour les petits fichiers, contournant le
    // quota) — seules les métadonnées (nom, taille) sont conservées, pour que le mail lui-même
    // reste synchronisé et que l'UI puisse afficher pourquoi la pièce jointe est absente.
    if (wouldExceed && (att.data || att.path)) {
      console.warn(
        `[Mail storage] quota dépassé — pièce jointe non stockée: user=${userId} email=${emailId} ` +
        `filename="${att.filename}" size=${size} used=${usedBytes} limit=${limitBytes}`,
      )
      stored.push({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        quotaExceeded: true,
      })
      continue
    }

    if (att.data) {
      const buffer = Buffer.from(att.data, 'base64')
      const { error } = await db.storage.from(MAIL_ATTACHMENTS_BUCKET).upload(path, buffer, {
        contentType: att.contentType || 'application/octet-stream',
        upsert: true,
      })
      if (!error) {
        stored.push({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          path,
        })
        continue
      }
      console.error('[Mail storage] upload:', error.message)
    }

    if (att.path) {
      stored.push({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        path: att.path,
      })
      continue
    }

    stored.push({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      data: att.size <= 512000 ? att.data : undefined,
    })
  }

  return stored
}

export async function downloadAttachmentBuffer(
  db: SupabaseClient,
  att: { path?: string; data?: string },
): Promise<Buffer | null> {
  if (att.path) {
    const { data, error } = await db.storage.from(MAIL_ATTACHMENTS_BUCKET).download(att.path)
    if (!error && data) return Buffer.from(await data.arrayBuffer())
    console.error('[Mail storage] download:', error?.message)
  }
  if (att.data) return Buffer.from(att.data, 'base64')
  return null
}

export async function createMailAttachmentSignedUrl(
  db: SupabaseClient,
  path: string,
  filename: string,
  mode: 'inline' | 'download',
  expiresIn = 60,
): Promise<string | null> {
  const { data, error } = await db.storage.from(MAIL_ATTACHMENTS_BUCKET).createSignedUrl(
    path,
    expiresIn,
    mode === 'download' ? { download: filename } : undefined,
  )
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
