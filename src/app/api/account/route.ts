export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, getUserEmailFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getBillingContext } from '@/lib/billing/subscription'
import { getOrganizationPayloadForUser } from '@/lib/organization'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const email = await getUserEmailFromRequest(req)

  const [{ data: profile, error: profileError }, authUserResult, org, billing] = await Promise.all([
    db
      .from('profiles')
      .select('id, full_name, company, role, created_at, terms_accepted_at, terms_version')
      .eq('id', userId)
      .single(),
    db.auth.admin.getUserById(userId),
    getOrganizationPayloadForUser(userId),
    getBillingContext(db, userId),
  ])

  const authUser = authUserResult.data.user

  if (profileError) {
    return Response.json({ success: false, error: profileError.message }, { status: 500 })
  }

  const createdAt = profile.created_at ?? authUser?.created_at ?? null

  return Response.json({
    success: true,
    data: {
      profile,
      email: email ?? authUser?.email ?? null,
      created_at: createdAt,
      organization: org,
      billing: {
        has_access: billing.hasAccess,
        plan: billing.effectivePlan,
        status: billing.subscription?.status ?? null,
        current_period_end: billing.subscription?.current_period_end ?? null,
        is_owner: billing.isOwner,
        is_billing_admin: billing.isBillingAdmin ?? false,
        limits: billing.limits,
        usage: {
          seats: billing.seatCount,
          storage_bytes: billing.storageBytes,
          storage_gb: Number((billing.storageBytes / (1024 ** 3)).toFixed(2)),
        },
      },
    },
  })
}
