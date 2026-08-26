/**
 * Paywall côté serveur : protégé par défaut, exceptions explicites.
 *
 * - Exemption totale (peu importe la méthode) : routes nécessaires pour s'authentifier,
 *   gérer son compte/abonnement, ou techniques (cron, webhook, updater desktop, metadata
 *   publique) — bloquer ces routes casserait le produit ou le paiement lui-même.
 * - Protection forcée (même en GET) : actions qui ne sont pas "mes données" mais un usage
 *   du produit lui-même (ex: télécharger l'installeur desktop).
 * - Règle par défaut pour tout le reste : GET/HEAD (lecture seule) reste accessible — un
 *   client dont l'abonnement expire garde l'accès à SES données (mail, AO, contacts,
 *   documents...), conformément au RGPD (droit d'accès/portabilité) ; toute autre méthode
 *   (POST/PATCH/PUT/DELETE — envoi, synchro, création, action) est protégée par défaut.
 *   Une route ajoutée demain est donc protégée en écriture sans rien faire de plus.
 */

const FULL_EXEMPT_PREFIXES = [
  '/api/auth/',
  '/api/billing/',
  '/api/desktop/update/',
  '/api/cron/',
  '/api/public/',
]

const FULL_EXEMPT_EXACT = [
  '/api/account',
  '/api/profile',
  '/api/build-info',
]

/** Usage du produit, pas des données du client — reste protégé même en GET. */
const FORCE_PROTECTED_EXACT = [
  '/api/desktop/download',
]

const SAFE_METHODS = new Set(['GET', 'HEAD'])

export function isBillingGateExempt(pathname: string, method: string): boolean {
  if (FORCE_PROTECTED_EXACT.includes(pathname)) return false
  if (FULL_EXEMPT_EXACT.includes(pathname)) return true
  if (FULL_EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix))) return true
  return SAFE_METHODS.has(method.toUpperCase())
}
