import type { SupabaseClient } from '@supabase/supabase-js'
import { DEVIS_BUCKET } from '@/lib/devis-storage'

export async function deleteAllTendersForUser(
  db: SupabaseClient,
  userId: string,
): Promise<{ deletedTenders: number; clearedEmailLinks: number }> {
  const { data: docs } = await db
    .from('tender_documents')
    .select('storage_path, bucket')
    .eq('user_id', userId)

  const pathsByBucket = new Map<string, string[]>()
  for (const doc of docs ?? []) {
    const bucket = doc.bucket ?? DEVIS_BUCKET
    const list = pathsByBucket.get(bucket) ?? []
    list.push(doc.storage_path)
    pathsByBucket.set(bucket, list)
  }

  for (const [bucket, paths] of pathsByBucket) {
    if (!paths.length) continue
    const chunkSize = 50
    for (let i = 0; i < paths.length; i += chunkSize) {
      await db.storage.from(bucket).remove(paths.slice(i, i + chunkSize))
    }
  }

  const { count: tenderCount } = await db
    .from('tenders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  const { error: deleteError } = await db.from('tenders').delete().eq('user_id', userId)
  if (deleteError) throw new Error(deleteError.message)

  const { data: clearedEmails } = await db
    .from('emails')
    .update({ tender_id: null })
    .eq('user_id', userId)
    .not('tender_id', 'is', null)
    .select('id')

  return {
    deletedTenders: tenderCount ?? 0,
    clearedEmailLinks: clearedEmails?.length ?? 0,
  }
}
