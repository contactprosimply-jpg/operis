export const dynamic = 'force-dynamic'

// Test 2026-07-13 : deploiement de verification du bandeau de mise a jour web.
/** Reflète le build reellement deploye a l'instant T — compare cote client au
 *  NEXT_PUBLIC_BUILD_ID embarque dans la page deja chargee pour detecter un nouveau
 *  deploiement (voir DesktopUpdateBanner). Public, sans donnee sensible. */
export async function GET() {
  return Response.json({ buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null })
}
