export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { DESKTOP_RELEASE_BUCKET } from '@/lib/desktop-download'

/**
 * Flux de mise à jour publique pour electron-updater (autoUpdater côté desktop).
 * Volontairement SANS authentification : le client desktop n'a pas de session web dans
 * son processus principal, et electron-updater ne sait pas envoyer d'en-têtes d'auth —
 * c'est le modèle standard de tous les auto-updaters Electron (le binaire n'est pas un
 * secret, seul le compte utilisateur donne accès à l'app elle-même).
 *
 * Redirige vers une URL signée Supabase Storage plutôt que de streamer les octets —
 * évite de bufferiser un exe de ~180 Mo dans la fonction serverless.
 */
const ALLOWED_NAME = /^(latest\.yml|Operis-Setup-\d+\.\d+\.\d+\.exe(\.blockmap)?)$/

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params
  const name = segments?.join('/') ?? ''

  if (!ALLOWED_NAME.test(name)) {
    return Response.json({ success: false, error: 'Fichier non autorisé' }, { status: 404 })
  }

  const db = createAdminClient()
  const { data, error } = await db.storage
    .from(DESKTOP_RELEASE_BUCKET)
    .createSignedUrl(name, 300)

  if (error || !data?.signedUrl) {
    return Response.json({ success: false, error: 'Fichier introuvable' }, { status: 404 })
  }

  return Response.redirect(data.signedUrl, 302)
}
