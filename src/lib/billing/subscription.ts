import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillingPlan } from '@/lib/billing/plan-limits'
import { planLimits, storageLimitBytes } from '@/lib/billing/plan-limits'
import { getOrgStorageBytes } from '@/lib/billing/storage-usage'
import { listOwnedOrganizations, userBelongsToOrganization } from '@/lib/organization'

export const TRIAL_DAYS = 14

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
  soloTrialEndsAt: string | null
  inTrial: boolean
  hasAccess: boolean
}

export async function ensureSubscriptionRow(db: SupabaseClient, orgId: string) {
  const { data: existing } = await db.from('subscriptions').select('id').eq('org_id', orgId).maybeSingle()
  if (existing) return

  const trialEnds = new Date()
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS)

  await db.from('subscriptions').insert({
    org_id: orgId,
    status: 'trialing',
    trial_ends_at: trialEnds.toISOString(),
  })
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

function soloTrialEndFromProfile(createdAt: string | null): string | null {
  if (!createdAt) return null
  const end = new Date(createdAt)
  end.setDate(end.getDate() + TRIAL_DAYS)
  return end.toISOString()
}

export function computeHasAccess(
  subscription: SubscriptionRow | null,
  soloTrialEndsAt: string | null,
): { hasAccess: boolean; inTrial: boolean } {
  const now = Date.now()

  if (subscription?.trial_ends_at && now < new Date(subscription.trial_ends_at).getTime()) {
    return { hasAccess: true, inTrial: true }
  }

  if (subscription?.status === 'active' && subscription.stripe_subscription_id) {
    if (!subscription.current_period_end || now < new Date(subscription.current_period_end).getTime()) {
      return { hasAccess: true, inTrial: false }
    }
  }

  if (!subscription && soloTrialEndsAt && now < new Date(soloTrialEndsAt).getTime()) {
    return { hasAccess: true, inTrial: true }
  }

  return { hasAccess: false, inTrial: false }
}

export function effectivePlanFromSubscription(
  subscription: SubscriptionRow | null,
  inTrial: boolean,
): BillingPlan | null {
  if (subscription?.plan) return subscription.plan
  if (inTrial) return 'pro'
  return null
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

  const { data: profile } = await db.from('profiles').select('created_at').eq('id', userId).maybeSingle()
  const soloTrialEndsAt = soloTrialEndFromProfile(profile?.created_at ?? null)
  const { hasAccess, inTrial } = computeHasAccess(subscription, soloTrialEndsAt)
  const effectivePlan = effectivePlanFromSubscription(subscription, inTrial)

  return {
    userId,
    orgId,
    isOwner,
    subscription,
    effectivePlan,
    limits: planLimits(effectivePlan),
    seatCount,
    storageBytes,
    soloTrialEndsAt,
    inTrial,
    hasAccess,
  }
}

export async function canAddOrgMember(db: SupabaseClient, orgId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: org } = await db.from('organizations').select('owner_id').eq('id', orgId).single()
  if (!org) return { ok: false, error: 'Groupe introuvable' }

  const ctx = await getBillingContext(db, org.owner_id)
  if (!ctx.hasAccess) {
    return { ok: false, error: 'Abonnement requis pour inviter des membres' }
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
    return { ok: false, error: 'Abonnement ou essai requis pour uploader des documents' }
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
  if (!ctx.hasAccess) return false
  if (ctx.inTrial) return true
  return ctx.effectivePlan === 'business'
}

export function billingBlockedResponse() {
  return Response.json({
    success: false,
    error: 'Choisissez une offre pour continuer',
    code: 'BILLING_REQUIRED',
  }, { status: 403 })
}

export async function requireBillingAccess(db: SupabaseClient, userId: string) {
  const ctx = await getBillingContext(db, userId)
  if (!ctx.hasAccess) return { ok: false as const, response: billingBlockedResponse() }
  return { ok: true as const, ctx }
}
