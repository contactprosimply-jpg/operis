export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { sendUserDigests } from '@/lib/digest'

// Passe toutes les heures : chaque utilisateur reçoit son récap à l'heure choisie (Paris),
// une fois par jour ouvré, uniquement s'il y a quelque chose à traiter.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stats = await sendUserDigests(createAdminClient())
  console.log(`[Cron/Digest] ${stats.sent} récap(s) envoyé(s), ${stats.failed} échec(s), ${stats.users} comptes`)
  return Response.json({ success: true, data: stats })
}
