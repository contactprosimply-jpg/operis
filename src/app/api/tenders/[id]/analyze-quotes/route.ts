export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { analyzeQuotesForTender } from '@/lib/mail-quote-extract'

export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { id } = await params
  const db = createAdminClient()

  const { data: tender } = await db
    .from('tenders')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (!tender) {
    return Response.json({ success: false, error: 'AO introuvable' }, { status: 404 })
  }

  try {
    const result = await analyzeQuotesForTender(db, userId, id)
    return Response.json({ success: true, data: result })
  } catch (err) {
    console.error('[Analyze quotes]', err)
    return Response.json({
      success: false,
      error: 'Erreur lors de l\'analyse des devis',
    }, { status: 500 })
  }
}
