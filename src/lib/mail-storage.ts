import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredEmailAttachment } from '@/lib/mail-attachments'

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
  }
}

export async function persistAttachmentsToStorage(
  db: SupabaseClient,
  userId: string,
  emailId: string,
  attachments: StoredEmailAttachment[],
): Promise<StoredEmailAttachment[]> {
  const stored: StoredEmailAttachment[] = []

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i]
    const path = `${userId}/${emailId}/${i}-${safeFilename(att.filename)}`

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
