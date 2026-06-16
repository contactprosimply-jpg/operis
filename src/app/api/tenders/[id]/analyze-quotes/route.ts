export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { analyzeQuotesForTender } from '@/lib/mail-quote-extract'
import { assertTenderAccess } from '@/lib/tender-access'
import { requireBillingAccess, hasBusinessFeatures } from '@/lib/billing/subscription'

export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const db = createAdminClient()

  const access = await assertTenderAccess(db, id, userId, 'mutate')
  if (!access.ok) {
    return Response.json({ success: false, error: access.error }, { status: access.status })
  }

  const billing = await requireBillingAccess(db, userId)
  if (!billing.ok) return billing.response

  if (!hasBusinessFeatures(billing.ctx)) {
    return Response.json({
      success: false,
      error: 'Analyse IA des devis disponible avec l\'offre Business',
      code: 'PLAN_BUSINESS_REQUIRED',
    }, { status: 403 })
  }

  try {
    const result = await analyzeQuotesForTender(db, access.tender.user_id, id)
    return Response.json({ success: true, data: result })
  } catch (err) {
    console.error('[Analyze quotes]', err)
    return Response.json({
      success: false,
      error: 'Erreur lors de l\'analyse des devis',
    }, { status: 500 })
  }
}
