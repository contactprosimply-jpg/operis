export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { treesForSubscription } from '@/lib/simply-green'

/** Impact réel communauté Simply Green — calculé depuis les abonnements Stripe réels
 *  (1 mois d'abonnement = 1 arbre), pas des chiffres d'exemple. */
export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const { data: subs } = await db
    .from('subscriptions')
    .select('created_at, stripe_subscription_id')
    .not('stripe_subscription_id', 'is', null)

  let treesFinanced = 0
  for (const sub of subs ?? []) {
    treesFinanced += treesForSubscription(sub.created_at, true)
  }

  return Response.json({
    success: true,
    data: {
      treesFinanced,
      participatingCompanies: subs?.length ?? 0,
    },
  })
}
