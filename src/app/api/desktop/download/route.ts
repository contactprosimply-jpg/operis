export const dynamic = 'force-dynamic'

import type { SupabaseClient } from '@supabase/supabase-js'
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

/** La version "vraie" est celle publiée dans latest.yml (mis à jour à chaque upload de
 *  release), pas celle figée dans le package.json au moment du dernier déploiement web —
 *  ces deux-là dérivent dès qu'on publie une nouvelle version desktop sans redéployer le site. */
async function getLatestDesktopVersion(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.storage.from(DESKTOP_RELEASE_BUCKET).download('latest.yml')
  if (error || !data) return null
  const text = await data.text()
  return text.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? null
}

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

  const latestVersion = await getLatestDesktopVersion(db)
  const filename = latestVersion
    ? (variant === 'setup' ? `Operis-Setup-${latestVersion}.exe` : `Operis-Portable-${latestVersion}.exe`)
    : DESKTOP_ARTIFACTS[variant]

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
