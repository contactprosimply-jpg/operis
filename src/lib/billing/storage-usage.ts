import type { SupabaseClient } from '@supabase/supabase-js'

export async function getOrgMemberUserIds(db: SupabaseClient, orgId: string): Promise<string[]> {
  const { data: org } = await db.from('organizations').select('owner_id').eq('id', orgId).single()
  const { data: members } = await db
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)

  const ids = new Set<string>()
  if (org?.owner_id) ids.add(org.owner_id)
  for (const row of members ?? []) ids.add(row.user_id as string)
  return [...ids]
}

async function sumTenderDocumentBytes(db: SupabaseClient, userIds: string[]): Promise<number> {
  const { data, error } = await db
    .from('tender_documents')
    .select('size')
    .in('user_id', userIds)
    .is('deleted_at', null)

  if (error) {
    const { data: fallback } = await db.from('tender_documents').select('size').in('user_id', userIds)
    return (fallback ?? []).reduce((sum, row) => sum + Number(row.size ?? 0), 0)
  }
  return (data ?? []).reduce((sum, row) => sum + Number(row.size ?? 0), 0)
}

/** Pièces jointes reçues/envoyées par mail (IMAP) — consomment aussi le quota Supabase réel,
 *  pas seulement les documents uploadés manuellement sur un AO. */
async function sumMailAttachmentBytes(db: SupabaseClient, userIds: string[]): Promise<number> {
  const { data, error } = await db.rpc('sum_email_attachment_bytes', { target_user_ids: userIds })
  if (error) {
    console.error('[storage-usage] sum_email_attachment_bytes:', error.message)
    return 0
  }
  return Number(data ?? 0)
}

export async function sumStorageBytesForUserIds(db: SupabaseClient, userIds: string[]): Promise<number> {
  if (!userIds.length) return 0
  const [docBytes, mailBytes] = await Promise.all([
    sumTenderDocumentBytes(db, userIds),
    sumMailAttachmentBytes(db, userIds),
  ])
  return docBytes + mailBytes
}

/** Chemin principal (utilisateur avec organisation) — la partie documents/devis est un
 *  compteur persistant maintenu par trigger (migration 057), plus rapide qu'une agrégation ;
 *  seules les pièces jointes mail restent calculées à la volée (migration 055). */
export async function getOrgStorageBytes(db: SupabaseClient, orgId: string): Promise<number> {
  const [{ data: org }, userIds] = await Promise.all([
    db.from('organizations').select('storage_used_bytes').eq('id', orgId).maybeSingle(),
    getOrgMemberUserIds(db, orgId),
  ])
  const docBytes = Number(org?.storage_used_bytes ?? 0)
  const mailBytes = await sumMailAttachmentBytes(db, userIds)
  return docBytes + mailBytes
}
