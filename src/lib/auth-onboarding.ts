import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureSubscriptionRow } from '@/lib/billing/subscription'
import { userBelongsToOrganization } from '@/lib/organization'

export async function completeSignupOnboarding(
  db: SupabaseClient,
  userId: string,
  opts: { fullName: string; companyName: string; email: string },
): Promise<void> {
  await db
    .from('profiles')
    .update({
      full_name: opts.fullName,
      company: opts.companyName,
    })
    .eq('id', userId)

  const existing = await userBelongsToOrganization(db, userId)
  if (existing) return

  const { data: org, error } = await db
    .from('organizations')
    .insert({ name: opts.companyName.trim(), owner_id: userId })
    .select('id')
    .single()

  if (error || !org) throw new Error(error?.message ?? 'Impossible de créer l\'organisation')

  await ensureSubscriptionRow(db, org.id)

  await db.from('organization_members').insert({
    organization_id: org.id,
    user_id: userId,
    role: 'owner',
    display_name: opts.fullName,
    email: opts.email,
    color: '#021246',
  })
}
