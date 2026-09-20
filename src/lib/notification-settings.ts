import type { SupabaseClient } from '@supabase/supabase-js'

export interface NotificationSettings {
  digest_enabled: boolean
  /** Heure locale (Paris) d'envoi du récap, 0-23. */
  digest_hour: number
  digest_last_sent_on: string | null
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  digest_enabled: true,
  digest_hour: 8,
  digest_last_sent_on: null,
}

function normalize(raw: Partial<NotificationSettings> | null | undefined): NotificationSettings {
  const hour = Number(raw?.digest_hour ?? DEFAULT_NOTIFICATION_SETTINGS.digest_hour)
  return {
    digest_enabled: raw?.digest_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.digest_enabled,
    digest_hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_NOTIFICATION_SETTINGS.digest_hour,
    digest_last_sent_on: raw?.digest_last_sent_on ?? null,
  }
}

/** Table absente (migration 062 pas appliquée) : valeurs par défaut, sans erreur. */
export async function getNotificationSettings(db: SupabaseClient, userId: string): Promise<NotificationSettings> {
  const { data, error } = await db
    .from('notification_settings')
    .select('digest_enabled, digest_hour, digest_last_sent_on')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return normalize(null)
  return normalize(data as Partial<NotificationSettings> | null)
}

export async function saveNotificationSettings(
  db: SupabaseClient,
  userId: string,
  patch: Partial<Pick<NotificationSettings, 'digest_enabled' | 'digest_hour'>>,
): Promise<{ settings: NotificationSettings; persisted: boolean; error?: string }> {
  const current = await getNotificationSettings(db, userId)
  const merged = normalize({ ...current, ...patch })

  // La ligne profiles doit exister (clé étrangère) — même précaution que user_settings.
  await db.from('profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })

  const { error } = await db.from('notification_settings').upsert({
    user_id: userId,
    digest_enabled: merged.digest_enabled,
    digest_hour: merged.digest_hour,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) {
    const missing = error.code === '42P01' || error.code === 'PGRST205' || /notification_settings/i.test(error.message)
    return {
      settings: merged,
      persisted: false,
      error: missing ? 'Réglage indisponible : la migration 062 doit être appliquée.' : error.message,
    }
  }
  return { settings: merged, persisted: true }
}

export async function markDigestSent(db: SupabaseClient, userId: string, date: string): Promise<void> {
  const current = await getNotificationSettings(db, userId)
  await db.from('profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
  await db.from('notification_settings').upsert({
    user_id: userId,
    digest_enabled: current.digest_enabled,
    digest_hour: current.digest_hour,
    digest_last_sent_on: date,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
}
