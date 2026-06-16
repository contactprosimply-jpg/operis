/** Routes accessibles sans session (landing, auth, tarifs publics, invitation). */
export const PUBLIC_ROUTE_EXACT = ['/', '/login', '/register', '/pricing'] as const

export const BILLING_EXEMPT_ROUTES = ['/choose-plan', '/settings/billing', '/billing/activating'] as const

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTE_EXACT.includes(pathname as typeof PUBLIC_ROUTE_EXACT[number])) return true
  if (pathname.startsWith('/join/')) return true
  return false
}

export function isBillingExemptRoute(pathname: string): boolean {
  return BILLING_EXEMPT_ROUTES.includes(pathname as typeof BILLING_EXEMPT_ROUTES[number])
}

/** Après login, rediriger depuis ces pages vers l'app. */
export function isAuthEntryRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '/login' || pathname === '/register'
}
