/** Site vitrine Operis — pas l'application métier (dashboard, mail, AO). */

export const PUBLIC_ROUTE_EXACT = [
  '/',
  '/login',
  '/register',
  '/signup',
  '/pricing',
  '/legal',
] as const

/** Pages membre du site (auth requise, pas de sidebar app). */
export const WEBSITE_MEMBER_ROUTES = ['/compte', '/telechargement'] as const

export const BILLING_EXEMPT_ROUTES = [
  '/choose-plan',
  '/settings/billing',
  '/billing/activating',
] as const

/** Shell minimal (nav site) — pas la sidebar application. */
export const WEBSITE_SHELL_ROUTES = [
  ...PUBLIC_ROUTE_EXACT,
  ...WEBSITE_MEMBER_ROUTES,
  ...BILLING_EXEMPT_ROUTES,
] as const

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTE_EXACT.includes(pathname as typeof PUBLIC_ROUTE_EXACT[number])) return true
  if (pathname.startsWith('/join/')) return true
  return false
}

export function isWebsiteMemberRoute(pathname: string): boolean {
  return WEBSITE_MEMBER_ROUTES.includes(pathname as typeof WEBSITE_MEMBER_ROUTES[number])
}

export function isWebsiteShellRoute(pathname: string): boolean {
  if (WEBSITE_SHELL_ROUTES.includes(pathname as typeof WEBSITE_SHELL_ROUTES[number])) return true
  if (pathname.startsWith('/join/')) return true
  return false
}

export function isBillingExemptRoute(pathname: string): boolean {
  return BILLING_EXEMPT_ROUTES.includes(pathname as typeof BILLING_EXEMPT_ROUTES[number])
}

/** Après connexion / inscription : retour au site membre, pas à l'app. */
export const POST_AUTH_ROUTE = '/compte'

export function isAuthEntryRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/login' || pathname === '/register' || pathname === '/signup'
}

/** Routes application métier (Electron / accès direct). */
export function isAppRoute(pathname: string): boolean {
  if (isWebsiteShellRoute(pathname)) return false
  if (pathname.startsWith('/api')) return false
  return true
}
