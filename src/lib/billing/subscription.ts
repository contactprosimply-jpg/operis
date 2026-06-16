import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillingPlan } from '@/lib/billing/plan-limits'
import { planLimits, storageLimitBytes } from '@/lib/billing/plan-limits'
import { getOrgStorageBytes } from '@/lib/billing/storage-usage'
import { listOwnedOrganizations, userBelongsToOrganization } from '@/lib/organization'

export type SubscriptionRow = {
  id: string
  org_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: string
  plan: BillingPlan | null
  current_period_end: string | null
  trial_ends_at: string | null
}

export type BillingContext = {
  userId: string
  orgId: string | null
  isOwner: boolean
  subscription: SubscriptionRow | null
  effectivePlan: BillingPlan | null
  limits: ReturnType<typeof planLimits>
  seatCount: number
  storageBytes: number
  hasAccess: boolean
}

const ACTIVE_STATUSES = new Set(['active', 'past_due'])

export async function ensureSubscriptionRow(db: SupabaseClient, orgId: string) {
  const { data: existing } = await db.from('subscriptions').select('id').eq('org_id', orgId).maybeSingle()
  if (existing) return

  await db.from('subscriptions').insert({
    org_id: orgId,
    status: 'inactive',
  })
}

/** Crée un groupe personnel si l'utilisateur n'a pas encore d'org (solo). */
export async function ensureBillingOrg(
  db: SupabaseClient,
  userId: string,
): Promise<{ orgId: string; isOwner: true }> {
  const owned = await listOwnedOrganizations(db, userId)
  if (owned.length) {
    await ensureSubscriptionRow(db, owned[0].id)
    return { orgId: owned[0].id, isOwner: true }
  }

  const membership = await userBelongsToOrganization(db, userId)
  if (membership) {
    const { data: org } = await db.from('organizations').select('owner_id').eq('id', membership.organizationId).single()
    if (org?.owner_id === userId) {
      await ensureSubscriptionRow(db, membership.organizationId)
      return { orgId: membership.organizationId, isOwner: true }
    }
    throw new Error('Seul le créateur du groupe peut souscrire un abonnement')
  }

  const { data: profile } = await db.from('profiles').select('full_name, company').eq('id', userId).maybeSingle()
  const { data: { user } } = await db.auth.admin.getUserById(userId)
  const orgName = profile?.company?.trim() || profile?.full_name?.trim() || user?.email?.split('@')[0] || 'Mon espace Operis'

  const { data: org, error } = await db
    .from('organizations')
    .insert({ name: orgName, owner_id: userId })
    .select('id')
    .single()

  if (error || !org) throw new Error(error?.message ?? 'Impossible de créer le groupe de facturation')

  await db.from('organization_members').insert({
    organization_id: org.id,
    user_id: userId,
    role: 'owner',
    display_name: profile?.full_name ?? user?.user_metadata?.full_name ?? user?.email,
    email: user?.email ?? null,
    color: '#3b7ef6',
  })

  await ensureSubscriptionRow(db, org.id)
  return { orgId: org.id, isOwner: true }
}

export async function resolveBillingOrg(
  db: SupabaseClient,
  userId: string,
): Promise<{ orgId: string | null; isOwner: boolean }> {
  const owned = await listOwnedOrganizations(db, userId)
  if (owned.length) return { orgId: owned[0].id, isOwner: true }

  const membership = await userBelongsToOrganization(db, userId)
  if (!membership) return { orgId: null, isOwner: false }

  const { data: org } = await db.from('organizations').select('owner_id').eq('id', membership.organizationId).single()
  return {
    orgId: membership.organizationId,
    isOwner: org?.owner_id === userId,
  }
}

export function hasActiveSubscription(subscription: SubscriptionRow | null): boolean {
  if (!subscription?.stripe_subscription_id) return false
  if (!ACTIVE_STATUSES.has(subscription.status)) return false
  if (subscription.current_period_end && Date.now() >= new Date(subscription.current_period_end).getTime()) {
    return false
  }
  return true
}

export async function getBillingContext(db: SupabaseClient, userId: string): Promise<BillingContext> {
  const { orgId, isOwner } = await resolveBillingOrg(db, userId)

  let subscription: SubscriptionRow | null = null
  let seatCount = 1
  let storageBytes = 0

  if (orgId) {
    let { data: sub } = await db.from('subscriptions').select('*').eq('org_id', orgId).maybeSingle()
    if (!sub) {
      await ensureSubscriptionRow(db, orgId)
      const refetch = await db.from('subscriptions').select('*').eq('org_id', orgId).maybeSingle()
      sub = refetch.data
    }
    subscription = (sub as SubscriptionRow | null) ?? null

    const { count } = await db
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
    seatCount = count ?? 1
    storageBytes = await getOrgStorageBytes(db, orgId)
  } else {
    const { data: docs } = await db.from('tender_documents').select('size').eq('user_id', userId)
    storageBytes = (docs ?? []).reduce((sum, row) => sum + Number(row.size ?? 0), 0)
    seatCount = 1
  }

  const hasAccess = hasActiveSubscription(subscription)
  const effectivePlan = hasAccess ? (subscription?.plan ?? null) : null

  return {
    userId,
    orgId,
    isOwner,
    subscription,
    effectivePlan,
    limits: planLimits(effectivePlan),
    seatCount,
    storageBytes,
    hasAccess,
  }
}

export async function canAddOrgMember(db: SupabaseClient, orgId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: org } = await db.from('organizations').select('owner_id').eq('id', orgId).single()
  if (!org) return { ok: false, error: 'Groupe introuvable' }

  const ctx = await getBillingContext(db, org.owner_id)
  if (!ctx.hasAccess) {
    return { ok: false, error: 'Abonnement actif requis pour inviter des membres' }
  }

  if (ctx.seatCount >= ctx.limits.seats) {
    return {
      ok: false,
      error: `Quota utilisateurs atteint (${ctx.limits.seats} max pour votre offre)`,
    }
  }
  return { ok: true }
}

export async function assertStorageQuota(
  db: SupabaseClient,
  userId: string,
  additionalBytes: number,
): Promise<{ ok: true; ctx: BillingContext } | { ok: false; error: string }> {
  const ctx = await getBillingContext(db, userId)
  if (!ctx.hasAccess) {
    return { ok: false, error: 'Abonnement actif requis pour uploader des documents' }
  }

  const limit = storageLimitBytes(ctx.effectivePlan)
  if (ctx.storageBytes + additionalBytes > limit) {
    const usedGb = (ctx.storageBytes / (1024 ** 3)).toFixed(1)
    return {
      ok: false,
      error: `Quota stockage atteint (${usedGb} Go / ${ctx.limits.storageGb} Go)`,
    }
  }
  return { ok: true, ctx }
}

export function hasBusinessFeatures(ctx: BillingContext): boolean {
  return ctx.hasAccess && ctx.effectivePlan === 'business'
}

export function billingBlockedResponse() {
  return Response.json({
    success: false,
    error: 'Abonnement actif requis — souscrivez une offre pour continuer',
    code: 'BILLING_REQUIRED',
  }, { status: 403 })
}

export async function requireBillingAccess(db: SupabaseClient, userId: string) {
  const ctx = await getBillingContext(db, userId)
  if (!ctx.hasAccess) return { ok: false as const, response: billingBlockedResponse() }
  return { ok: true as const, ctx }
}
