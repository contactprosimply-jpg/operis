import type { SupabaseClient } from '@supabase/supabase-js'

export const DEVIS_BUCKET = 'devis'

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'fichier'
}

export async function uploadTenderDocument(
  db: SupabaseClient,
  userId: string,
  tenderId: string,
  file: { filename: string; contentType: string; buffer: Buffer },
  docId: string,
) {
  const path = `${userId}/${tenderId}/${docId}-${safeFilename(file.filename)}`
  const { error } = await db.storage.from(DEVIS_BUCKET).upload(path, file.buffer, {
    contentType: file.contentType || 'application/octet-stream',
    upsert: true,
  })
  if (error) throw new Error(error.message)
  return path
}

export async function downloadDevisFile(db: SupabaseClient, path: string): Promise<Buffer | null> {
  const { data, error } = await db.storage.from(DEVIS_BUCKET).download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

export async function listDevisPrefix(db: SupabaseClient, prefix: string) {
  const { data, error } = await db.storage.from(DEVIS_BUCKET).list(prefix, { limit: 100 })
  if (error) return []
  return data ?? []
}
