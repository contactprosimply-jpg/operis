import type { NextRequest } from 'next/server'

/**
 * Poids max accepté pour un fichier/l'ensemble des pièces jointes d'une requête — un
 * DCE/plan BTP de 15-20 Mo est un usage normal, pas un abus (voir
 * experimental.proxyClientMaxBodySize dans next.config.ts, relevé en conséquence).
 * Partagé par tous les endpoints qui acceptent un fichier en base64 dans le corps JSON :
 * tenders/[id]/documents, mail/send, tenders/[id]/consult, mail/drafts.
 */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024

// Le corps JSON (base64) est ~33% plus gros que les octets bruts, + une petite marge pour
// les autres champs (filename, contentType, sujet, corps du message...).
export const MAX_JSON_BODY_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 1.35) + 8192

export function tooLargeResponse() {
  return Response.json({
    success: false,
    error: `Fichier(s) trop volumineux (maximum ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} Mo au total)`,
  }, { status: 413 })
}

/**
 * À appeler avant tout req.json() — rejette tôt sur Content-Length, avant de risquer un
 * JSON.parse() sur un corps tronqué par le proxy (voir next.config.ts). Un Content-Length
 * absent/invalide ne bloque pas ici : le contrôle définitif reste la taille réelle décodée,
 * vérifiée après coup par l'appelant.
 */
export function requestBodyTooLarge(req: NextRequest): boolean {
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  return contentLength > MAX_JSON_BODY_BYTES
}
