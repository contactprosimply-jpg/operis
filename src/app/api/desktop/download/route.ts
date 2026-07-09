export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getBillingContext } from '@/lib/billing/subscription'
import {
  DESKTOP_ARTIFACTS,
  DESKTOP_RELEASE_BUCKET,
  type DesktopVariant,
} from '@/lib/desktop-download'

const SIGNED_URL_TTL_SEC = 60 * 15

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const variant = (req.nextUrl.searchParams.get('variant') || 'setup') as DesktopVariant
  if (!(variant in DESKTOP_ARTIFACTS)) {
    return Response.json({ success: false, error: 'Variante invalide' }, { status: 400 })
  }

  const db = createAdminClient()
  const billing = await getBillingContext(db, userId)
  if (!billing.hasAccess) {
    return Response.json(
      { success: false, error: 'Abonnement actif requis pour télécharger Operis' },
      { status: 403 },
    )
  }

  const filename = DESKTOP_ARTIFACTS[variant]

  const { data: signed, error } = await db.storage
    .from(DESKTOP_RELEASE_BUCKET)
    .createSignedUrl(filename, SIGNED_URL_TTL_SEC, { download: filename })

  if (!error && signed?.signedUrl) {
    return Response.json({
      success: true,
      data: { url: signed.signedUrl, filename, expires_in: SIGNED_URL_TTL_SEC },
    })
  }

  const links = await import('@/lib/desktop-download').then(m => m.getDesktopDownloadLinks())
  const fallback = variant === 'setup' ? links.windowsSetup : links.windowsPortable
  if (fallback?.startsWith('http') || fallback?.startsWith('/')) {
    return Response.json({
      success: true,
      data: { url: fallback, filename, expires_in: null, source: 'static' },
    })
  }

  return Response.json(
    {
      success: false,
      error: 'Installateur indisponible — contactez operiscontact@gmail.com',
    },
    { status: 404 },
  )
}
