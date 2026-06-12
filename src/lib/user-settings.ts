import type { SupabaseClient } from '@supabase/supabase-js'

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

export async function getUserSettings(
  db: SupabaseClient,
  userId: string,
): Promise<UserSettings> {
  const { data } = await db
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (data) return data as UserSettings

  return { user_id: userId, ...DEFAULT_USER_SETTINGS }
}

export async function upsertUserSettings(
  db: SupabaseClient,
  userId: string,
  patch: Partial<Omit<UserSettings, 'user_id'>>,
): Promise<UserSettings> {
  const row = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await db
    .from('user_settings')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as UserSettings
}

export function isWorkingDay(date = new Date()): boolean {
  const day = date.getDay()
  return day !== 0 && day !== 6
}

export function relanceMaxReached(count: number, max: number): boolean {
  if (max < 0) return false
  return count >= max
}
