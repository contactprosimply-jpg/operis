import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export interface UserSettings {
  user_id: string
  relance_first_delay_days: number
  relance_interval_days: number
  relance_max_count: number
  relance_working_days_only: boolean
  relance_confirm_before_send: boolean
  auto_labels_enabled: boolean
  label_a_traiter_delay_hours: number
  label_en_retard_delay_days: number
  mail_signature: string
  mail_signature_enabled: boolean
  updated_at?: string
}

export const DEFAULT_USER_SETTINGS: Omit<UserSettings, 'user_id'> = {
  relance_first_delay_days: 3,
  relance_interval_days: 2,
  relance_max_count: 3,
  relance_working_days_only: true,
  relance_confirm_before_send: true,
  auto_labels_enabled: true,
  label_a_traiter_delay_hours: 24,
  label_en_retard_delay_days: 3,
  mail_signature: '',
  mail_signature_enabled: true,
}

export type UserSettingsSaveResult = {
  settings: UserSettings
  persisted: boolean
  warning?: string
}

const SETTINGS_CACHE_KEY = 'operis_user_settings'

export function cacheUserSettingsLocally(settings: UserSettings) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

export function readCachedUserSettings(): UserSettings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UserSettings
  } catch {
    return null
  }
}

export function isMissingUserSettingsTableError(error: Pick<PostgrestError, 'message' | 'code'> | null): boolean {
  if (!error) return false
  const msg = (error.message ?? '').toLowerCase()
  return (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || (msg.includes('user_settings') && (
      msg.includes('does not exist')
      || msg.includes('could not find')
      || msg.includes('schema cache')
    ))
  )
}

function normalizeSettings(userId: string, raw: Partial<UserSettings> | null): UserSettings {
  return {
    user_id: userId,
    relance_first_delay_days: Number(raw?.relance_first_delay_days ?? DEFAULT_USER_SETTINGS.relance_first_delay_days),
    relance_interval_days: Number(raw?.relance_interval_days ?? DEFAULT_USER_SETTINGS.relance_interval_days),
    relance_max_count: Number(raw?.relance_max_count ?? DEFAULT_USER_SETTINGS.relance_max_count),
    relance_working_days_only: raw?.relance_working_days_only ?? DEFAULT_USER_SETTINGS.relance_working_days_only,
    relance_confirm_before_send: raw?.relance_confirm_before_send ?? DEFAULT_USER_SETTINGS.relance_confirm_before_send,
    auto_labels_enabled: raw?.auto_labels_enabled ?? DEFAULT_USER_SETTINGS.auto_labels_enabled,
    label_a_traiter_delay_hours: Number(raw?.label_a_traiter_delay_hours ?? DEFAULT_USER_SETTINGS.label_a_traiter_delay_hours),
    label_en_retard_delay_days: Number(raw?.label_en_retard_delay_days ?? DEFAULT_USER_SETTINGS.label_en_retard_delay_days),
    mail_signature: raw?.mail_signature ?? DEFAULT_USER_SETTINGS.mail_signature,
    mail_signature_enabled: raw?.mail_signature_enabled ?? DEFAULT_USER_SETTINGS.mail_signature_enabled,
    updated_at: raw?.updated_at,
  }
}

function settingsRow(userId: string, settings: UserSettings, updatedAt: string) {
  return {
    user_id: userId,
    relance_first_delay_days: settings.relance_first_delay_days,
    relance_interval_days: settings.relance_interval_days,
    relance_max_count: settings.relance_max_count,
    relance_working_days_only: settings.relance_working_days_only,
    relance_confirm_before_send: settings.relance_confirm_before_send,
    auto_labels_enabled: settings.auto_labels_enabled,
    label_a_traiter_delay_hours: settings.label_a_traiter_delay_hours,
    label_en_retard_delay_days: settings.label_en_retard_delay_days,
    mail_signature: settings.mail_signature,
    mail_signature_enabled: settings.mail_signature_enabled,
    updated_at: updatedAt,
  }
}

async function ensureUserProfile(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })

  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(`Profil utilisateur introuvable: ${error.message}`)
  }
}

export async function getUserSettings(
  db: SupabaseClient,
  userId: string,
): Promise<UserSettings> {
  const { data, error } = await db
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingUserSettingsTableError(error)) {
      console.warn('[user-settings] table missing, using defaults')
    } else {
      console.error('[user-settings] get:', error.message)
    }
    return normalizeSettings(userId, null)
  }

  if (data) return normalizeSettings(userId, data as UserSettings)

  return normalizeSettings(userId, null)
}

export async function upsertUserSettings(
  db: SupabaseClient,
  userId: string,
  patch: Partial<Omit<UserSettings, 'user_id'>>,
): Promise<UserSettingsSaveResult> {
  const current = await getUserSettings(db, userId)
  const merged = normalizeSettings(userId, { ...current, ...patch })
  const now = new Date().toISOString()
  const row = settingsRow(userId, merged, now)

  await ensureUserProfile(db, userId)

  const { data, error } = await db
    .from('user_settings')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) {
    if (isMissingUserSettingsTableError(error)) {
      return {
        settings: { ...merged, updated_at: now },
        persisted: false,
        warning: 'Table user_settings absente — paramètres enregistrés localement. Appliquez la migration 024_user_settings.sql dans Supabase.',
      }
    }

    if (/foreign key|violates foreign key|user_settings_user_id_fkey/i.test(error.message)) {
      throw new Error(
        `Profil utilisateur manquant pour ${userId}. Vérifiez que la ligne existe dans profiles.`,
      )
    }

    throw new Error(error.message)
  }

  return {
    settings: normalizeSettings(userId, data as UserSettings),
    persisted: true,
  }
}

export function isWorkingDay(date = new Date()): boolean {
  const day = date.getDay()
  return day !== 0 && day !== 6
}

export function relanceMaxReached(count: number, max: number): boolean {
  if (max < 0) return false
  return count >= max
}
