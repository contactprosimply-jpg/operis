import type { SupabaseClient } from '@supabase/supabase-js'
import { extractEmailAddress } from '@/lib/mail-attachments'

function normalizeSender(fromText: string): string {
  return (extractEmailAddress(fromText) || fromText.trim().toLowerCase())
}

export async function isSenderBlocked(
  db: SupabaseClient,
  userId: string,
  fromText: string,
): Promise<boolean> {
  const sender = normalizeSender(fromText)
  if (!sender) return false
  const { data } = await db
    .from('blocked_senders')
    .select('id')
    .eq('user_id', userId)
    .eq('sender', sender)
    .maybeSingle()
  return !!data
}

export async function blockSender(
  db: SupabaseClient,
  userId: string,
  fromText: string,
): Promise<void> {
  const sender = normalizeSender(fromText)
  if (!sender) return
  await db
    .from('blocked_senders')
    .upsert({ user_id: userId, sender }, { onConflict: 'user_id,sender' })
}

export async function unblockSender(
  db: SupabaseClient,
  userId: string,
  fromText: string,
): Promise<void> {
  const sender = normalizeSender(fromText)
  if (!sender) return
  await db
    .from('blocked_senders')
    .delete()
    .eq('user_id', userId)
    .eq('sender', sender)
}
