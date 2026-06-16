export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getBillingContext } from '@/lib/billing/subscription'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const ctx = await getBillingContext(db, userId)

  return Response.json({
    success: true,
    data: {
      has_access: ctx.hasAccess,
      plan: ctx.effectivePlan,
      status: ctx.subscription?.status ?? null,
      current_period_end: ctx.subscription?.current_period_end ?? null,
      stripe_subscription_id: ctx.subscription?.stripe_subscription_id ?? null,
      limits: ctx.limits,
      usage: {
        seats: ctx.seatCount,
        storage_bytes: ctx.storageBytes,
        storage_gb: Number((ctx.storageBytes / (1024 ** 3)).toFixed(2)),
        storage_remaining_gb: Number(Math.max(0, ctx.limits.storageGb - ctx.storageBytes / (1024 ** 3)).toFixed(2)),
      },
      org_id: ctx.orgId,
      is_owner: ctx.isOwner,
    },
  })
}
